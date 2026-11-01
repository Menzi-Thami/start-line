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

namespace StartLine.Application.Features.Coaching;

/// <summary>
/// A planned session completed by a Strava run Taperday holds now, worked out on this read and never stored. It lapses
/// with the cached run (<see cref="CachedUntil"/>), after which the session shows whatever the runner ticked.
/// </summary>
/// <param name="State">Completed (no check-in), or Conflict: the runner said they skipped it, and their word stands.</param>
/// <param name="Measure">Distance, or Duration for a session whose steps are all timed: the planned and actual figures to compare.</param>
public sealed record SyncedCompletionDto(
    DateOnly Date,
    SessionType SessionType,
    Guid ActivityId,
    SyncedCompletionState State,
    PrescriptionMeasure Measure,
    double PlannedKm,
    double ActualKm,
    double PlannedSeconds,
    double ActualSeconds,
    SyncedFeedback Feedback,
    DateTimeOffset? CachedUntil)
{
    public static SyncedCompletionDto From(SyncedCompletion c)
    {
        ArgumentNullException.ThrowIfNull(c);
        return new(c.Date, c.SessionType, c.ActivityId, c.State, c.Measure, ActivitySummaryDto.Round(c.PlannedKm, 2),
            ActivitySummaryDto.Round(c.ActualKm, 2), Math.Round(c.PlannedTime.TotalSeconds), Math.Round(c.ActualTime.TotalSeconds), c.Feedback,
            c.CachedUntil);
    }
}

public sealed record GetSyncedCompletionsQuery(Guid PlanId) : IRequest<IReadOnlyList<SyncedCompletionDto>>;

internal sealed class GetSyncedCompletionsHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
    : IRequestHandler<GetSyncedCompletionsQuery, IReadOnlyList<SyncedCompletionDto>>
{
    public async Task<IReadOnlyList<SyncedCompletionDto>> Handle(GetSyncedCompletionsQuery request, CancellationToken cancellationToken)
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
            return []; // A plan that can't be built has no sessions to complete.
        }

        if (sessions.Count == 0)
        {
            return [];
        }

        var from = sessions.Min(s => s.Date);
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date <= today)
            .ToListAsync(cancellationToken);
        // Only what Taperday holds now: a lapsed Strava copy is invisible here, as everywhere.
        var runs = await db.Activities.AsNoTracking().Visible(time.GetUtcNow())
            .Where(a => a.RunnerId == runner.Id && a.Kind != ActivityKind.Other && a.LocalDate >= from && a.LocalDate <= today)
            .ToListAsync(cancellationToken);
        var completions = SyncedCompletions.Of(
            sessions,
            [.. checkIns.Select(c => new TrendCheckIn(c.Date, c.SessionType, c.Status, c.Effort, c.Pain, c.ActivityId, c.IsAdditional))],
            [.. runs.Select(TrendRun.Of)]);
        return [.. completions.Select(SyncedCompletionDto.From)];
    }
}
