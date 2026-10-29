using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Activities;

/// <summary>One run in the runner's long-term totals: a ticked session at its planned distance, or an upload at its own.</summary>
public sealed record LoggedRunDto(DateOnly Date, double DistanceKm, LoggedRunSource Source, bool DistanceUnreported = false);

/// <summary>
/// The runs behind Home's "Your running" totals, from the 1st of January (or further back, for the last 12 weeks and last
/// month): what the runner ticked off and what they uploaded. Never a synced Strava run (<see cref="RunningLog"/>).
/// </summary>
public sealed record GetRunningLogQuery : IRequest<IReadOnlyList<LoggedRunDto>>;

internal sealed partial class GetRunningLogHandler(
    IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time, ILogger<GetRunningLogHandler> logger)
    : IRequestHandler<GetRunningLogQuery, IReadOnlyList<LoggedRunDto>>
{
    /// <summary>Twelve full weeks and this one, for the weekly chart.</summary>
    public const int WeeksBack = 13;

    public async Task<IReadOnlyList<LoggedRunDto>> Handle(GetRunningLogQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var today = CoachCalls.LocalToday(runner, time);
        var from = Earliest(new DateOnly(today.Year, 1, 1), new DateOnly(today.Year, today.Month, 1).AddMonths(-1), today.AddDays(-7 * WeeksBack));

        var plans = await db.SavedPlans.AsNoTracking().Where(p => p.RunnerId == runner.Id).ToListAsync(cancellationToken);
        var planIds = plans.Select(p => p.Id).ToList();
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => planIds.Contains(c.SavedPlanId) && c.Date >= from && c.Date <= today && c.Status != CheckInStatus.Skipped)
            .ToListAsync(cancellationToken);
        var uploads = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.LocalDate >= from && a.LocalDate <= today)
            .ToListAsync(cancellationToken);

        List<TickedSession> ticks = [];
        foreach (var byPlan in checkIns.GroupBy(c => c.SavedPlanId))
        {
            var sessions = await SessionsAsync(plans.Single(p => p.Id == byPlan.Key), cancellationToken);
            ticks.AddRange(byPlan.Select(c => new TickedSession(
                c.Date,
                c.IsAdditional ? 0 : sessions.FirstOrDefault(s => s.Date == c.Date && s.Type == c.SessionType)?.DistanceKm ?? 0,
                c.Answers, c.IsAdditional)));
        }

        return [.. RunningLog.Of(ticks, uploads).Select(r => new LoggedRunDto(r.Date, ActivitySummaryDto.Round(r.DistanceKm, 2), r.Source, r.DistanceUnreported))];
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

    private static DateOnly Earliest(params DateOnly[] dates) => dates.Min();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Running totals left out planned distances of saved plan {PlanId}: the plan can't be built")]
    private static partial void LogPlanUnavailable(ILogger logger, Guid planId, Exception exception);
}
