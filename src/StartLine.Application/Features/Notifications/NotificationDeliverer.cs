using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Notifications;

/// <summary>Durable per-device events, deferred through quiet hours and claimed before sending.</summary>
internal sealed partial class NotificationDeliverer(IApplicationDbContext db, IPushSettings settings, IPushSender sender,
    IPushAddressProtector protector, TimeProvider time, NotificationReview reviews, PlanBuilder builder, ILogger<NotificationDeliverer> logger)
{
    public async Task QueueAsync(PushSubscription device, NotificationKind kind, Guid subjectId, string eventKey,
        DateTimeOffset due, DateTimeOffset expires, CancellationToken cancellationToken)
    {
        if (!settings.IsEnabled || !device.Allows(kind) || expires <= time.GetUtcNow()) return;
        var zone = await ZoneAsync(device.RunnerId, cancellationToken);
        var candidate = due > time.GetUtcNow() ? due : time.GetUtcNow();
        var at = AllowedAt(device, candidate, zone);
        if (at >= expires || await db.NotificationDeliveries.AnyAsync(d => d.DeviceId == device.Id && d.Kind == kind && d.EventKey == eventKey, cancellationToken)) return;
        var delivery = NotificationDelivery.Create(device.Id, subjectId, kind, eventKey, at, expires);
        db.NotificationDeliveries.Add(delivery);
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateException)
        {
            db.NotificationDeliveries.Entry(delivery).State = EntityState.Detached;
            if (!await db.PushSubscriptions.AnyAsync(d => d.Id == device.Id, cancellationToken)) return;
            if (!await db.NotificationDeliveries.AnyAsync(d => d.DeviceId == device.Id && d.Kind == kind && d.EventKey == eventKey, cancellationToken)) throw;
        }
    }

    public async Task<DateTimeOffset?> FlushAsync(CancellationToken cancellationToken, Guid? onlyDevice = null)
    {
        if (!settings.IsEnabled) return null;
        var now = time.GetUtcNow();
        await db.NotificationDeliveries.Where(d => d.ExpiresAt < now.AddDays(-7)
            && (d.Kind != NotificationKind.ConnectionAlert || !db.ProviderConnections.Any(c => c.Id == d.SubjectId && c.Status == ConnectionStatus.NeedsReconnect)))
            .ExecuteDeleteAsync(cancellationToken);
        var pending = await db.NotificationDeliveries.Where(d => d.ClaimedAt == null && d.ExpiresAt > now
            && (onlyDevice == null || d.DeviceId == onlyDevice)).OrderBy(d => d.NotBefore).Take(100).ToListAsync(cancellationToken);
        foreach (var delivery in pending)
        {
            if (delivery.NotBefore > now) continue;
            var device = await db.PushSubscriptions.SingleOrDefaultAsync(d => d.Id == delivery.DeviceId, cancellationToken);
            if (device is null) continue;
            var zone = await ZoneAsync(device.RunnerId, cancellationToken);
            var observed = time.GetUtcNow();
            var allowed = AllowedAt(device, observed, zone);
            if (allowed > observed && allowed < delivery.ExpiresAt && device.Allows(delivery.Kind))
            {
                delivery.Defer(allowed);
                await db.SaveChangesAsync(cancellationToken);
                continue;
            }

            var message = allowed >= delivery.ExpiresAt || !device.Allows(delivery.Kind)
                ? null : await MessageAsync(delivery, device, zone, cancellationToken);
            delivery.Claim(now);
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateConcurrencyException)
            {
                db.NotificationDeliveries.Entry(delivery).State = EntityState.Detached;
                continue;
            }

            if (message is null) continue;
            try
            {
                var address = new PushAddress(protector.Unprotect(device.Endpoint), protector.Unprotect(device.P256dh), protector.Unprotect(device.Auth));
                if (!await sender.SendAsync(address, message, cancellationToken))
                {
                    db.PushSubscriptions.Remove(device);
                    await db.SaveChangesAsync(cancellationToken);
                }
            }
            catch (PushUnavailableException) { LogUnavailable(logger); }
        }

        return await db.NotificationDeliveries.AsNoTracking().Where(d => d.ClaimedAt == null && d.ExpiresAt > now)
            .MinAsync(d => (DateTimeOffset?)d.NotBefore, cancellationToken);
    }

    private async Task<TimeZoneInfo> ZoneAsync(Guid runnerId, CancellationToken cancellationToken) =>
        TimeProviderExtensions.ZoneOf(await db.Runners.Where(r => r.Id == runnerId).Select(r => r.TimeZone).SingleAsync(cancellationToken));

    internal static DateTimeOffset AllowedAt(PushSubscription device, DateTimeOffset instant, TimeZoneInfo zone)
    {
        var local = TimeZoneInfo.ConvertTime(instant, zone).DateTime;
        var allowed = device.NextAllowed(local);
        // Preserve the actual instant during a repeated DST hour when no quiet period changes it.
        return allowed == local ? instant : TimeProviderExtensions.FromLocal(allowed, zone);
    }

    private async Task<PushMessage?> MessageAsync(NotificationDelivery delivery, PushSubscription device, TimeZoneInfo zone, CancellationToken cancellationToken)
    {
        var tag = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{delivery.Kind}:{delivery.EventKey}")))[..32];
        if (delivery.Kind == NotificationKind.RunCongratulations)
        {
            var run = await db.Activities.AsNoTracking().Visible(time.GetUtcNow()).SingleOrDefaultAsync(a => a.Id == delivery.SubjectId
                && a.RunnerId == device.RunnerId && a.Source == ActivitySource.Strava, cancellationToken);
            if (run is null || time.GetUtcNow() - run.StartedAt > TickPrompts.MaxRunAge) return null;
            var units = await db.Runners.Where(r => r.Id == device.RunnerId).Select(r => r.Units).SingleAsync(cancellationToken);
            var body = settings.IncludeRunData ? $"Your {Reminders.Distance(run.DistanceKm, units)} run has arrived from Strava." : "Your run has arrived from Strava.";
            return new("Nice work — run finished!", $"{body} Open it to review your run and log how it fits your plan.", RunCelebrator.OpensAt(run.Id), tag);
        }

        if (delivery.Kind == NotificationKind.ConnectionAlert)
        {
            var connection = await db.ProviderConnections.AsNoTracking().SingleOrDefaultAsync(c => c.Id == delivery.SubjectId
                && c.RunnerId == device.RunnerId && c.Status == ConnectionStatus.NeedsReconnect, cancellationToken);
            return connection is not null && delivery.EventKey == ConnectionKey(connection)
                ? new("Reconnect Strava", "Strava needs your permission again. Open Connections to resume importing runs.", "/?view=account&settings=connections", tag) : null;
        }

        var saved = await db.SavedPlans.AsNoTracking().SingleOrDefaultAsync(p => p.Id == delivery.SubjectId
            && p.RunnerId == device.RunnerId && p.Status == SavedPlanStatus.Active, cancellationToken);
        if (saved is null) return null;
        if (delivery.Kind == NotificationKind.TrainingReview)
        {
            var week = DateOnly.ParseExact(delivery.EventKey, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            var runner = await db.Runners.AsNoTracking().SingleAsync(r => r.Id == device.RunnerId, cancellationToken);
            if (await reviews.PendingWeekAsync(saved, runner, cancellationToken) != week) return null;
            return new("Training adjustment ready to review", "Your weekly review has a suggested change. Review it in Taperday; your plan stays unchanged until you accept.", "/?view=home&review=1", tag);
        }

        var target = DateOnly.ParseExact(delivery.EventKey, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (target != DateOnly.FromDateTime(time.LocalNow(zone)).AddDays(1)) return null;
        try
        {
            var plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), await CoachCalls.ForAsync(db, saved.Id, cancellationToken), saved.Adjustments);
            var sessions = plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Date == target).ToList();
            if (delivery.Kind == NotificationKind.RacePreparation ? !sessions.Any(s => s.Type == SessionType.Race)
                : !sessions.Any(s => s.Type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace)) return null;
        }
        catch (Exception e) when (e is NotFoundException or Domain.Common.DomainException) { return null; }
        return delivery.Kind == NotificationKind.RacePreparation
            ? new("Race day is tomorrow", "Check your start time, travel, race number, familiar kit and breakfast. Your checklist and goal splits are ready.", $"/?view=plan&prepare=race&date={delivery.EventKey}", tag)
            : new("Prepare for tomorrow’s long run", "Check your session, route, familiar fuel, water and kit. Keep preparation simple and follow the effort planned for you.", $"/?view=plan&prepare=long&date={delivery.EventKey}", tag);
    }

    public static string ConnectionKey(ProviderConnection connection) => $"{connection.Id:N}:{Convert.ToHexString(connection.Version)}";

    [LoggerMessage(Level = LogLevel.Warning, Message = "Notification was not accepted by its push service; its claimed event will not be repeated")]
    private static partial void LogUnavailable(ILogger logger);
}
