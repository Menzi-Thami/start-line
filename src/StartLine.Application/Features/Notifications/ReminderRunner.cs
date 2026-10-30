using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Notifications;

/// <summary>
/// Sends every reminder that's due, then says when the next one is. When one is due is decided from the plan as written
/// and the runner's own clock. What it says comes from the plan and the runner's check-ins; the coach's call, the plan as
/// the coach has it and the distance run are added only when <see cref="IPushSettings.IncludeRunData"/> is on, because
/// they come from runs (Strava's among them). A reminder missed while the app slept goes out the next time this runs, as
/// long as it's still that day where the runner is; each day's goes once at most.
/// </summary>
internal sealed partial class ReminderRunner(
    IApplicationDbContext db,
    IPushSettings settings,
    IPushSender sender,
    IPushAddressProtector protector,
    PlanBuilder builder,
    PlanCoach coach,
    AdditionalNotifications additional,
    TimeProvider time,
    ILogger<ReminderRunner> logger)
    : IReminderRunner
{
    /// <summary>Where a tap on a reminder lands: Home, which opens on today's run.</summary>
    public const string OpensAt = "/?view=home";

    public async Task<DateTimeOffset?> RunDueAsync(CancellationToken cancellationToken)
    {
        if (!settings.IsEnabled)
        {
            return null;
        }

        var next = await additional.RunAsync(cancellationToken);
        var devices = await db.PushSubscriptions.ToListAsync(cancellationToken);
        if (devices.Count == 0)
        {
            return next;
        }

        var runnerIds = devices.Select(d => d.RunnerId).Distinct().ToList();
        var runners = await db.Runners.AsNoTracking()
            .Where(r => runnerIds.Contains(r.Id))
            .ToDictionaryAsync(r => r.Id, cancellationToken);
        var plans = await db.SavedPlans.AsNoTracking()
            .Where(p => runnerIds.Contains(p.RunnerId) && p.Status == SavedPlanStatus.Active)
            .ToListAsync(cancellationToken);

        foreach (var runnerDevices in devices.GroupBy(d => d.RunnerId))
        {
            var runner = runners.GetValueOrDefault(runnerDevices.Key);
            var zone = TimeProviderExtensions.ZoneOf(runner?.TimeZone ?? "");
            var saved = plans.SingleOrDefault(p => p.RunnerId == runnerDevices.Key);
            var plan = PlanAsWritten(saved);
            ReminderFacts? facts = null;
            foreach (var device in runnerDevices)
            {
                var localNow = time.LocalNow(zone);
                if (runner is not null && saved is not null && device.NextAllowed(localNow) == localNow
                    && Reminders.DueDay(device, plan, localNow) is { } day
                    && TimeProviderExtensions.FromLocal(day.ToDateTime(device.RemindAt), zone) <= time.GetUtcNow())
                {
                    // Worked out once for all of a runner's devices: the coach's call is made at most once a week anyway.
                    facts ??= await FactsAsync(saved, runner, plan!, day, cancellationToken);
                    if (Reminders.For(facts, day, device.WeekAhead, device.Daily) is { } reminder && !await SendAsync(device, reminder, cancellationToken))
                    {
                        continue;
                    }
                }

                if (Reminders.NextDue(device, plan, localNow) is { } due)
                {
                    var scheduled = TimeProviderExtensions.FromLocal(DateOnly.FromDateTime(due).ToDateTime(device.RemindAt), zone);
                    var now = time.GetUtcNow();
                    var at = NotificationDeliverer.AllowedAt(device, scheduled > now ? scheduled : now, zone);
                    next = next is { } soonest && soonest <= at ? soonest : at;
                }
            }
        }

        return next;
    }

    /// <summary>
    /// What a day's reminder is made of. Always: the plan and the runner's units, and on a Monday the check-ins of the week
    /// before. With run data allowed: the already accepted coach's call, the plan as the
    /// coach has it, and last week's runs.
    /// </summary>
    private async Task<ReminderFacts> FactsAsync(SavedPlan saved, Runner runner, TrainingPlan asWritten, DateOnly day, CancellationToken cancellationToken)
    {
        var plan = asWritten;
        string? coachSays = null;
        if (settings.IncludeRunData)
        {
            var calls = await coach.CallsAsync(saved, runner, cancellationToken);
            plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), calls, saved.Adjustments, day);
            coachSays = calls.FirstOrDefault(c => c.WeekStart == day) is { } call ? CoachWords.Of(call) : null;
        }

        if (day.DayOfWeek != DayOfWeek.Monday || plan.Weeks.FirstOrDefault(w => w.StartDate == day.AddDays(-7)) is not { } lastWeek)
        {
            return new ReminderFacts(plan, runner.Units, CoachSays: coachSays);
        }

        var planned = lastWeek.Sessions.Where(s => SessionCheckIn.IsCheckable(s.Type)).ToList();
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == saved.Id && c.Date >= lastWeek.StartDate && c.Date < day)
            .ToListAsync(cancellationToken);
        bool CheckedIn(PlannedSession s) => checkIns.Any(c => c.Date == s.Date && c.SessionType == s.Type && !c.IsAdditional && c.Status != CheckInStatus.Skipped);
        if (!settings.IncludeRunData)
        {
            return new ReminderFacts(plan, runner.Units, new LastWeek(planned.Count, planned.Count(CheckedIn), lastWeek.PlannedKm));
        }

        var runs = await db.Activities.AsNoTracking()
            .Visible(time.GetUtcNow())
            .Where(a => a.RunnerId == runner.Id && a.LocalDate >= lastWeek.StartDate && a.LocalDate < day)
            .ToListAsync(cancellationToken);
        var done = planned.Count(s => CheckedIn(s) || runs.Any(a => a.LocalDate == s.Date && a.PlannedSession?.SessionType == s.Type));
        return new ReminderFacts(plan, runner.Units, new LastWeek(planned.Count, done, lastWeek.PlannedKm, Math.Round(runs.Sum(a => a.DistanceKm), 1)), coachSays);
    }

    /// <summary>
    /// The plan as the runner wrote it: without the coach's calls, which come partly from their runs. Null when it can't
    /// be built any more (its race has left the calendar), so one runner's plan never stops everyone else's reminders.
    /// </summary>
    private TrainingPlan? PlanAsWritten(SavedPlan? saved)
    {
        if (saved is null)
        {
            return null;
        }

        try
        {
            return builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), adjustments: saved.Adjustments);
        }
        catch (Exception e) when (e is NotFoundException or DomainException)
        {
            LogPlanUnavailable(logger, saved.Id, e);
            return null;
        }
    }

    /// <summary>Sends one reminder. False when the device has gone, and its subscription with it.</summary>
    private async Task<bool> SendAsync(PushSubscription device, Reminder reminder, CancellationToken cancellationToken)
    {
        // Recorded before it's sent: a crash after sending can then never send the same day's reminder again.
        device.MarkReminded(reminder.Date);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another instance of the API (a deploy overlapping the old one) marked it first, and sends it. Or the runner
            // just changed or turned off this device; either way, not this pass's to send. Let go of the stale copy so
            // it doesn't fail the next device's save too.
            db.PushSubscriptions.Entry(device).State = EntityState.Detached;
            return true;
        }

        var to = new PushAddress(protector.Unprotect(device.Endpoint), protector.Unprotect(device.P256dh), protector.Unprotect(device.Auth));
        var message = new PushMessage(reminder.Title, reminder.Body, OpensAt, $"reminder-{reminder.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}");
        try
        {
            if (await sender.SendAsync(to, message, cancellationToken))
            {
                return true;
            }
        }
        catch (PushUnavailableException e)
        {
            // Missed rather than risk sending it twice. The next one is tomorrow's.
            LogSendFailed(logger, device.Id, e);
            return true;
        }

        db.PushSubscriptions.Remove(device);
        await db.SaveChangesAsync(cancellationToken);
        LogDeviceGone(logger, device.Id);
        return false;
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Reminders for saved plan {PlanId} skipped: the plan can't be built")]
    private static partial void LogPlanUnavailable(ILogger logger, Guid planId, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Reminder to device {DeviceId} not delivered; the push service is unavailable")]
    private static partial void LogSendFailed(ILogger logger, Guid deviceId, Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Device {DeviceId} has gone from its push service; reminders to it stopped")]
    private static partial void LogDeviceGone(ILogger logger, Guid deviceId);
}
