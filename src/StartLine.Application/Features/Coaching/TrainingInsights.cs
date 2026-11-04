using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Coaching;

/// <summary>One answer to a weekly coaching suggestion, as the history shows it.</summary>
public sealed record CoachingDecisionDto(
    DateOnly WeekStart,
    CoachingOutcome Outcome,
    CoachVerdict Verdict,
    IReadOnlyList<CoachReason> Reasons,
    bool ChangedPlan,
    RecoveryReadiness Recovery,
    DateTimeOffset DecidedAt)
{
    public static CoachingDecisionDto From(CoachingDecisionLog log)
    {
        ArgumentNullException.ThrowIfNull(log);
        return new(log.WeekStart, log.Outcome, log.Verdict, log.ReasonList, log.ChangedPlan, log.Recovery, log.DecidedAt);
    }
}

/// <summary>The trends on a saved plan, worked out now, and the runner's latest answers to the weekly coach.</summary>
public sealed record TrainingInsightsDto(DateOnly Today, TrainingTrendsResult Trends, IReadOnlyList<CoachingDecisionDto> Decisions);

public sealed record GetTrainingInsightsQuery(Guid PlanId) : IRequest<TrainingInsightsDto>;

internal sealed class GetTrainingInsightsHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, RunningLogReader reader, TimeProvider time)
    : IRequestHandler<GetTrainingInsightsQuery, TrainingInsightsDto>
{
    public const int DecisionsShown = 12;

    public async Task<TrainingInsightsDto> Handle(GetTrainingInsightsQuery request, CancellationToken cancellationToken)
    {
        var saved = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var today = CoachCalls.LocalToday(runner, time);
        IReadOnlyList<PlannedSession> sessions;
        try
        {
            var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
            sessions = [.. builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), calls, saved.Adjustments, today).Weeks.SelectMany(w => w.Sessions)];
        }
        catch (Exception e) when (e is NotFoundException or DomainException)
        {
            // A plan whose race has left the calendar still has its runs; it just has nothing planned to compare.
            sessions = [];
        }

        var trends = await TrainingTrendsReader.ReadAsync(db, reader, runner, saved.Id, sessions, today, time.GetUtcNow(), cancellationToken);
        var decisions = await db.CoachingDecisions.AsNoTracking()
            .Where(d => d.SavedPlanId == saved.Id)
            .OrderByDescending(d => d.DecidedAt)
            .Take(DecisionsShown)
            .ToListAsync(cancellationToken);
        return new(today, trends, [.. decisions.Select(CoachingDecisionDto.From)]);
    }
}

/// <summary>
/// Reads what <see cref="TrainingTrends"/> needs for one runner and plan, up to <c>today</c>, and works the trends out.
/// Shared by the insights on Home and the weekly recap email, so both say the same thing. Nothing is stored.
/// </summary>
internal static class TrainingTrendsReader
{
    public static async Task<TrainingTrendsResult> ReadAsync(
        IApplicationDbContext db, RunningLogReader reader, Runner runner, Guid planId, IReadOnlyList<PlannedSession> sessions,
        DateOnly today, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var from = TrainingTrends.From(today);

        // Totals include the Strava runs Taperday holds now: shown, never stored.
        var logged = await reader.ReadAsync(runner, from, today, includeSynced: true, cancellationToken);
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == planId && c.Date >= from && c.Date <= today)
            .ToListAsync(cancellationToken);
        var runs = await db.Activities.AsNoTracking().Visible(now)
            .Where(a => a.RunnerId == runner.Id && a.Kind != ActivityKind.Other && a.LocalDate >= from && a.LocalDate <= today)
            .ToListAsync(cancellationToken);
        return TrainingTrends.Of(
            today,
            logged,
            sessions,
            [.. checkIns.Select(c => new TrendCheckIn(c.Date, c.SessionType, c.Status, c.Effort, c.Pain, c.ActivityId, c.IsAdditional))],
            [.. runs.Select(TrendRun.Of)]);
    }
}
