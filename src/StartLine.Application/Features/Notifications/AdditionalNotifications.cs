using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Notifications;

/// <summary>Uses the same read-only proposal rules as the review screen; never accepts a coaching change.</summary>
internal sealed partial class NotificationReview(IApplicationDbContext db, PlanCoach coach, PlanBuilder builder, TimeProvider time, ILogger<NotificationReview> logger)
{
    public async Task<DateOnly?> PendingWeekAsync(SavedPlan saved, Runner runner, CancellationToken cancellationToken)
    {
        try { return await FindPendingWeekAsync(saved, runner, cancellationToken); }
        catch (Exception e) when (e is NotFoundException or Domain.Common.DomainException)
        {
            LogUnavailable(logger, saved.Id);
            return null;
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Review notification skipped for saved plan {PlanId}: the plan cannot be rebuilt")]
    private static partial void LogUnavailable(ILogger logger, Guid planId);

    private async Task<DateOnly?> FindPendingWeekAsync(SavedPlan saved, Runner runner, CancellationToken cancellationToken)
    {
        var existing = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        var proposed = await coach.CallsAsync(saved, runner, cancellationToken, preview: true);
        var pending = proposed.LastOrDefault(p => !existing.Any(e => e.WeekStart == p.WeekStart));
        if (pending is null) return null;
        var today = CoachCalls.LocalToday(runner, time);
        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        var original = builder.BuildPlan(query, existing, saved.Adjustments, pending.WeekStart);
        if (today.DayOfWeek == DayOfWeek.Sunday)
        {
            var from = pending.WeekStart.AddDays(-7);
            var planned = original.Weeks.FirstOrDefault(w => w.StartDate == from)?.Sessions.Where(s => SessionCheckIn.IsCheckable(s.Type)).ToList();
            if (planned is not null)
            {
                var answers = await db.SessionCheckIns.AsNoTracking().Where(c => c.SavedPlanId == saved.Id && !c.IsAdditional && c.Date >= from && c.Date < pending.WeekStart).ToListAsync(cancellationToken);
                var uploads = await db.Activities.AsNoTracking().Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.LocalDate >= from && a.LocalDate < pending.WeekStart).ToListAsync(cancellationToken);
                if (planned.Any(s => !answers.Any(c => c.Date == s.Date && c.SessionType == s.Type)
                    && !uploads.Any(a => a.LocalDate == s.Date && a.PlannedSession?.SessionType == s.Type))) return null;
            }
        }

        return JsonSerializer.Serialize(original) == JsonSerializer.Serialize(builder.BuildPlan(query, proposed, saved.Adjustments, pending.WeekStart))
            ? null : pending.WeekStart;
    }
}

internal sealed class AdditionalNotifications(IApplicationDbContext db, NotificationDeliverer deliverer,
    NotificationReview reviews, PlanBuilder builder, TimeProvider time)
{
    public async Task<DateTimeOffset?> RunAsync(CancellationToken cancellationToken)
    {
        var next = await deliverer.FlushAsync(cancellationToken);
        var devices = await db.PushSubscriptions.ToListAsync(cancellationToken);
        var runnerIds = devices.Select(d => d.RunnerId).Distinct().ToList();
        var runners = await db.Runners.AsNoTracking().Where(r => runnerIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, cancellationToken);
        var plans = await db.SavedPlans.AsNoTracking().Where(p => runnerIds.Contains(p.RunnerId) && p.Status == SavedPlanStatus.Active).ToListAsync(cancellationToken);
        var connections = await db.ProviderConnections.AsNoTracking().Where(c => runnerIds.Contains(c.RunnerId) && c.Status == ConnectionStatus.NeedsReconnect).ToListAsync(cancellationToken);
        foreach (var device in devices)
        {
            if (!runners.TryGetValue(device.RunnerId, out var runner)) continue;
            var zone = TimeProviderExtensions.ZoneOf(runner.TimeZone);
            var local = time.LocalNow(zone);
            var today = DateOnly.FromDateTime(local);
            if (device.ConnectionAlerts)
            {
                foreach (var connection in connections.Where(c => c.RunnerId == runner.Id))
                    await deliverer.QueueAsync(device, NotificationKind.ConnectionAlert, connection.Id,
                        NotificationDeliverer.ConnectionKey(connection), time.GetUtcNow(), time.GetUtcNow().AddDays(7), cancellationToken);
            }

            var saved = plans.SingleOrDefault(p => p.RunnerId == runner.Id);
            if (saved is null || !(device.TrainingReviews || device.LongRunPreparation || device.RacePreparation)) continue;
            TrainingPlan plan;
            try { plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), await CoachCalls.ForAsync(db, saved.Id, cancellationToken), saved.Adjustments); }
            catch (Exception e) when (e is NotFoundException or Domain.Common.DomainException) { continue; }

            if (device.TrainingReviews && today >= plan.StartDate && today <= plan.RaceDate)
            {
                var at = today.ToDateTime(today.DayOfWeek == DayOfWeek.Sunday ? device.PreparationAt : device.RemindAt);
                var following = today.AddDays(1);
                var scheduledReview = TimeProviderExtensions.FromLocal(at, zone);
                var reviewAt = time.GetUtcNow() < scheduledReview ? scheduledReview
                    : TimeProviderExtensions.FromLocal(following.ToDateTime(following.DayOfWeek == DayOfWeek.Sunday ? device.PreparationAt : device.RemindAt), zone);
                next = Earlier(next, NotificationDeliverer.AllowedAt(device, reviewAt, zone));
                if (time.GetUtcNow() >= scheduledReview)
                {
                    var target = today.DayOfWeek == DayOfWeek.Sunday ? today.AddDays(1) : today;
                    var week = target.AddDays(-((int)target.DayOfWeek + 6) % 7);
                    var key = week.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                    if (!await db.NotificationDeliveries.AnyAsync(d => d.DeviceId == device.Id && d.SubjectId == saved.Id
                        && d.Kind == NotificationKind.TrainingReview && d.EventKey == key, cancellationToken)
                        && await reviews.PendingWeekAsync(saved, runner, cancellationToken) == week)
                        await deliverer.QueueAsync(device, NotificationKind.TrainingReview, saved.Id, key, time.GetUtcNow(),
                            TimeProviderExtensions.FromLocal(week.AddDays(7).ToDateTime(TimeOnly.MinValue), zone), cancellationToken);
                }
            }

            for (var date = today; date < today.AddDays(Reminders.LookAheadDays) && date < plan.RaceDate; date = date.AddDays(1))
            {
                var sessions = plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Date == date.AddDays(1)).ToList();
                var kind = device.RacePreparation && sessions.Any(s => s.Type == SessionType.Race) ? NotificationKind.RacePreparation
                    : device.LongRunPreparation && sessions.Any(s => s.Type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace)
                        ? NotificationKind.LongRunPreparation : (NotificationKind?)null;
                if (kind is null) continue;
                var due = TimeProviderExtensions.FromLocal(date.ToDateTime(device.PreparationAt), zone);
                if (due <= time.GetUtcNow())
                    await deliverer.QueueAsync(device, kind.Value, saved.Id, date.AddDays(1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), due,
                        TimeProviderExtensions.FromLocal(date.AddDays(1).ToDateTime(TimeOnly.MinValue), zone), cancellationToken);
                else
                {
                    var allowed = NotificationDeliverer.AllowedAt(device, due, zone);
                    if (allowed < TimeProviderExtensions.FromLocal(date.AddDays(1).ToDateTime(TimeOnly.MinValue), zone))
                    { next = Earlier(next, allowed); break; }
                }
            }
        }

        return Earlier(next, await deliverer.FlushAsync(cancellationToken));
    }

    private static DateTimeOffset? Earlier(DateTimeOffset? a, DateTimeOffset? b) => a is null ? b : b is null ? a : a < b ? a : b;
}
