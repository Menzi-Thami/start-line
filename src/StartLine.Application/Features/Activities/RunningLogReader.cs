using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Activities;

/// <summary>
/// Reads the runs behind the running totals for a span of days: check-ins (with the distance each planned session
/// asked for) and runs, combined by <see cref="RunningLog"/>. Shared by Home's totals and the run-data breakdown, so the
/// two always count the same runs the same way.
/// </summary>
internal sealed partial class RunningLogReader(IApplicationDbContext db, PlanBuilder builder, TimeProvider time, ILogger<RunningLogReader> logger)
{
    public async Task<IReadOnlyList<LoggedRun>> ReadAsync(Runner runner, DateOnly from, DateOnly to, bool includeSynced, CancellationToken cancellationToken)
    {
        var plans = await db.SavedPlans.AsNoTracking().Where(p => p.RunnerId == runner.Id).ToListAsync(cancellationToken);
        var planIds = plans.Select(p => p.Id).ToList();
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => planIds.Contains(c.SavedPlanId) && c.Date >= from && c.Date <= to && c.Status != CheckInStatus.Skipped)
            .ToListAsync(cancellationToken);
        var now = time.GetUtcNow();
        var activities = await db.Activities.AsNoTracking().Visible(now)
            .Where(a => a.RunnerId == runner.Id && (includeSynced || a.Source == ActivitySource.Upload) && a.LocalDate >= from && a.LocalDate <= to)
            .ToListAsync(cancellationToken);

        List<TickedSession> ticks = [];
        foreach (var byPlan in checkIns.GroupBy(c => c.SavedPlanId))
        {
            var sessions = await SessionsAsync(plans.Single(p => p.Id == byPlan.Key), cancellationToken);
            ticks.AddRange(byPlan.Select(c => new TickedSession(
                c.Date,
                c.PrescribedKm ?? (c.IsAdditional ? 0 : sessions.FirstOrDefault(s => s.Date == c.Date && s.Type == c.SessionType)?.DistanceKm ?? 0),
                c.Answers, c.IsAdditional, c.UpdatedAt)));
        }

        return includeSynced ? RunningLog.WithSynced(ticks, activities, now) : RunningLog.Of(ticks, activities);
    }

    /// <summary>
    /// The plan as the coach has it, which is what the runner checked in against. A past plan that can't be built any more
    /// (its race has left the calendar) has no planned distances: its ticks count only where the runner gave one.
    /// </summary>
    private async Task<IReadOnlyList<PlannedSession>> SessionsAsync(SavedPlan plan, CancellationToken cancellationToken)
    {
        try
        {
            var calls = await CoachCalls.ForAsync(db, plan.Id, cancellationToken);
            return [.. builder.BuildPlan(SavedPlanMapping.ToQuery(plan.Inputs), calls, plan.Adjustments).Weeks.SelectMany(w => w.Sessions)];
        }
        catch (Exception e) when (e is NotFoundException or DomainException)
        {
            LogPlanUnavailable(logger, plan.Id, e);
            return [];
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Running totals left out planned distances of saved plan {PlanId}: the plan can't be built")]
    private static partial void LogPlanUnavailable(ILogger logger, Guid planId, Exception exception);
}
