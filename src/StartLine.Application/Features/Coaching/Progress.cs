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

/// <summary>The progress story on a saved plan for a span of weeks, worked out now.</summary>
public sealed record ProgressStoryDto(DateOnly Today, ProgressStoryResult Story);

public sealed record GetProgressStoryQuery(Guid PlanId, int Weeks) : IRequest<ProgressStoryDto>;

internal sealed class GetProgressStoryHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, RunningLogReader reader, TimeProvider time)
    : IRequestHandler<GetProgressStoryQuery, ProgressStoryDto>
{
    public async Task<ProgressStoryDto> Handle(GetProgressStoryQuery request, CancellationToken cancellationToken)
    {
        if (!ProgressStory.IsSpan(request.Weeks))
        {
            throw new ValidationException(new Dictionary<string, string[]> { ["weeks"] = ["Choose 4, 8 or 12 weeks."] });
        }

        var saved = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var today = CoachCalls.LocalToday(runner, time);
        var from = ProgressStory.From(today, request.Weeks);
        var now = time.GetUtcNow();

        // Totals include the Strava runs Taperday holds now: shown, never stored.
        var logged = await reader.ReadAsync(runner, from, today, includeSynced: true, cancellationToken);
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date <= today)
            .ToListAsync(cancellationToken);
        // Every run held, not just the span's: a best is new only against everything before it.
        var runs = await db.Activities.AsNoTracking().Visible(now)
            .Where(a => a.RunnerId == runner.Id && a.Kind != ActivityKind.Other && a.LocalDate <= today)
            .ToListAsync(cancellationToken);
        TrainingPlan? plan;
        try
        {
            var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
            plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), calls, saved.Adjustments, today);
        }
        catch (Exception e) when (e is NotFoundException or DomainException)
        {
            // A plan whose race has left the calendar still has its runs; it just has no goal or sessions to compare.
            plan = null;
        }

        var story = ProgressStory.Of(
            today,
            request.Weeks,
            logged,
            plan is null ? [] : [.. plan.Weeks.SelectMany(w => w.Sessions)],
            [.. checkIns.Select(c => new TrendCheckIn(c.Date, c.SessionType, c.Status, c.Effort, c.Pain, c.ActivityId, c.IsAdditional))],
            [.. runs.Select(a => new ProgressRun(
                new TrendRun(a.Id, a.LocalDate, a.DistanceKm, a.MovingTime, a.AverageHeartRate, a.Source, a.PlannedSession?.SessionType),
                [.. a.BestEfforts]))],
            plan);
        return new(today, story);
    }
}
