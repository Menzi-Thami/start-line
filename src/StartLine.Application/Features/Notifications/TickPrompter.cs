using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Common;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Notifications;

/// <summary>
/// Asks a runner to tick a session when a run synced from Strava matches it: once per session, only to runners who turned
/// reminders on, and never about a run more than <see cref="TickPrompts.MaxRunAge"/> old, so a backfill asks nothing. What
/// it keeps is the note that it asked (<see cref="TickPrompt"/>: the session alone). The run's distance goes in the push
/// only with <see cref="IPushSettings.IncludeRunData"/>, and is never kept. It only ever asks: the tick is the runner's.
/// </summary>
internal sealed partial class TickPrompter(
    IApplicationDbContext db,
    IPushSettings settings,
    IPushSender sender,
    IPushAddressProtector protector,
    PlanBuilder builder,
    ITickTokens tokens,
    TimeProvider time,
    ILogger<TickPrompter> logger)
{
    /// <summary>Where a tap lands: Home, with that session's "Ran this? Tick it" ready.</summary>
    public static string OpensAt(DateOnly date, SessionType type) =>
        string.Create(CultureInfo.InvariantCulture, $"/?view=home&tick={date:yyyy-MM-dd}.{type}");

    /// <summary>Asks about <paramref name="run"/>, a synced run just recorded and saved, if it's due.</summary>
    public async Task OfferAsync(Activity run, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(run);
        var now = time.GetUtcNow();
        // The cheap checks first: most synced runs are a refresh of one already asked about, or too old to ask.
        if (!settings.IsEnabled || run.Source != ActivitySource.Strava || run.PlannedSession is not { } planned || now - run.StartedAt > TickPrompts.MaxRunAge)
        {
            return;
        }

        var devices = await db.PushSubscriptions.Where(s => s.RunnerId == run.RunnerId).ToListAsync(cancellationToken);
        var saved = await db.SavedPlans.AsNoTracking()
            .SingleOrDefaultAsync(p => p.RunnerId == run.RunnerId && p.Status == SavedPlanStatus.Active, cancellationToken);
        if (devices.Count == 0 || saved is null)
        {
            return;
        }

        var (date, type) = (run.LocalDate, planned.SessionType);
        var session = await SessionAsync(saved, date, type, cancellationToken);
        var facts = new TickPromptFacts(
            RemindersOn: true,
            InPlan: session is not null,
            CheckedIn: await db.SessionCheckIns.AnyAsync(c => c.SavedPlanId == saved.Id && c.Date == date && c.SessionType == type, cancellationToken),
            AlreadyPrompted: await db.TickPrompts.AnyAsync(p => p.SavedPlanId == saved.Id && p.Date == date && p.SessionType == type, cancellationToken));
        if (session is null || !TickPrompts.IsDue(run, facts, now) || !await NoteAsync(TickPrompt.For(saved.Id, date, type), cancellationToken))
        {
            return;
        }

        var runner = await db.Runners.AsNoTracking().SingleAsync(r => r.Id == run.RunnerId, cancellationToken);
        var zone = TimeProviderExtensions.ZoneOf(runner.TimeZone);
        var message = new PushMessage(
            TickPrompts.Title(session),
            TickPrompts.Body(
                session,
                settings.IncludeRunData ? run.DistanceKm : null,
                TimeZoneInfo.ConvertTime(run.StartedAt, zone).DateTime,
                DateOnly.FromDateTime(time.LocalNow(zone)),
                runner.Units),
            OpensAt(date, type),
            string.Create(CultureInfo.InvariantCulture, $"tick-{date:yyyy-MM-dd}-{type}"),
            tokens.Issue(new TickClaim(runner.Id, saved.Id, date, type)));

        foreach (var device in devices)
        {
            await SendAsync(device, message, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Notes the session as asked about, before anything is sent, so a crash part-way can never ask twice. False when
    /// another sync pass noted it first: that one asks.
    /// </summary>
    private async Task<bool> NoteAsync(TickPrompt prompt, CancellationToken cancellationToken)
    {
        db.TickPrompts.Add(prompt);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException)
        {
            db.TickPrompts.Entry(prompt).State = EntityState.Detached;
            if (await db.TickPrompts.AsNoTracking().AnyAsync(
                p => p.SavedPlanId == prompt.SavedPlanId && p.Date == prompt.Date && p.SessionType == prompt.SessionType, cancellationToken))
            {
                return false;
            }

            throw;
        }
    }

    /// <summary>The session as the coach has the plan, or null when it isn't there or the plan can't be built any more.</summary>
    private async Task<PlannedSession?> SessionAsync(SavedPlan saved, DateOnly date, SessionType type, CancellationToken cancellationToken)
    {
        try
        {
            var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
            return builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), calls).Weeks
                .SelectMany(w => w.Sessions)
                .FirstOrDefault(s => s.Date == date && s.Type == type);
        }
        catch (Exception e) when (e is NotFoundException or DomainException)
        {
            LogPlanUnavailable(logger, saved.Id, e);
            return null;
        }
    }

    /// <summary>Sends to one device; a device its push service says has gone is forgotten, as with reminders.</summary>
    private async Task SendAsync(PushSubscription device, PushMessage message, CancellationToken cancellationToken)
    {
        var to = new PushAddress(protector.Unprotect(device.Endpoint), protector.Unprotect(device.P256dh), protector.Unprotect(device.Auth));
        try
        {
            if (!await sender.SendAsync(to, message, cancellationToken))
            {
                db.PushSubscriptions.Remove(device);
                LogDeviceGone(logger, device.Id);
            }
        }
        catch (PushUnavailableException e)
        {
            // Not asked again: the session is still there to tick in the app.
            LogSendFailed(logger, device.Id, e);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "No tick prompt for saved plan {PlanId}: the plan can't be built")]
    private static partial void LogPlanUnavailable(ILogger logger, Guid planId, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Tick prompt to device {DeviceId} not delivered; the push service is unavailable")]
    private static partial void LogSendFailed(ILogger logger, Guid deviceId, Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Device {DeviceId} has gone from its push service; reminders to it stopped")]
    private static partial void LogDeviceGone(ILogger logger, Guid deviceId);
}
