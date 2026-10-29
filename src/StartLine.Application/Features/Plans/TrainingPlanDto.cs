using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Plans;

public sealed record TrainingPlanDto(
    RaceSummaryDto Race,
    DistanceCategory Category,
    TimeSpan GoalTime,
    double GoalPaceSecondsPerKm,
    DateOnly StartDate,
    IReadOnlyList<PaceZoneDto> Paces,
    IReadOnlyList<PlanWeekDto> Weeks,
    IReadOnlyList<PlanWarningDto> Warnings,
    ReplanDto? Replan = null,
    TimeSpan? SuggestedGoal = null,
    GoalOutlookDto? Outlook = null, IReadOnlyList<SessionRevision>? Adjustments = null)
{
    public static TrainingPlanDto From(TrainingPlan plan, RaceSummaryDto race, GoalOutlook? outlook = null)
    {
        ArgumentNullException.ThrowIfNull(plan);

        return new(
            race,
            plan.Category,
            plan.GoalTime,
            Math.Round(Pace.Of(plan.RaceDistance, plan.GoalTime).SecondsPerKilometre, 1),
            plan.StartDate,
            [.. plan.Paces.OrderBy(p => p.Key).Select(p => new PaceZoneDto(
                p.Key,
                Math.Round(p.Value.Fastest.SecondsPerKilometre),
                Math.Round(p.Value.Slowest.SecondsPerKilometre)))],
            [.. plan.Weeks.Select(w => new PlanWeekDto(
                w.Number,
                w.StartDate,
                w.Phase,
                w.IsCutback,
                w.PlannedKm,
                [.. w.Sessions.Select(s => new SessionDto(s.Date, s.Type, s.Title, s.Detail, s.Purpose, s.DistanceKm, s.Zone,
                    [.. (s.Exercises ?? []).Select(e => new StrengthExerciseDto(e.Exercise, e.Sets, e.Reps, e.Unit, e.Summary))],
                    s.Steps?.Select(SessionStepDto.From).ToList() ?? []))],
                w.IsReplanned))],
            [.. plan.Warnings.Select(w => new PlanWarningDto(w.Code, w.Message))],
            plan.Replan is { } replan ? new ReplanDto(replan.From, replan.Setback, replan.RecentWeeklyKm) : null,
            plan.SuggestedGoal,
            outlook is null ? null : GoalOutlookDto.From(outlook));
    }
}

/// <summary>
/// The coach's read on the goal: <c>Verdict</c> and a <c>Summary</c> sentence, the <c>Reasons</c> behind it in plain words,
/// and a <c>SuggestedGoal</c> when the runner is ahead of their goal or it's at risk. <c>FitnessToday</c> is the race time
/// the evidence points to. It never changes the plan.
/// </summary>
public sealed record GoalOutlookDto(
    GoalVerdict Verdict,
    string Summary,
    IReadOnlyList<OutlookReasonDto> Reasons,
    TimeSpan? SuggestedGoal,
    TimeSpan? FitnessToday)
{
    public static GoalOutlookDto From(GoalOutlook outlook)
    {
        ArgumentNullException.ThrowIfNull(outlook);
        return new(outlook.Verdict, outlook.Summary, [.. outlook.Reasons.Select(r => new OutlookReasonDto(r.Code, r.Message))], outlook.SuggestedGoal, outlook.FitnessToday);
    }
}

public sealed record OutlookReasonDto(string Code, string Message);

public sealed record RaceSummaryDto(string? Slug, string Name, DateOnly Date, double DistanceKm);

public sealed record PaceZoneDto(PaceZone Zone, double FastestSecondsPerKm, double SlowestSecondsPerKm);

public sealed record PlanWeekDto(
    int Number,
    DateOnly StartDate,
    TrainingPhase Phase,
    bool IsCutback,
    double PlannedKm,
    IReadOnlyList<SessionDto> Sessions,
    bool IsReplanned = false);

/// <summary>The plan was rebuilt from <c>From</c> after a setback; weeks before then are as first planned.</summary>
public sealed record ReplanDto(DateOnly From, Setback Setback, double? RecentWeeklyKm);

public sealed record SessionDto(
    DateOnly Date,
    SessionType Type,
    string Title,
    string Detail,
    string Purpose,
    double DistanceKm,
    PaceZone? Zone,
    IReadOnlyList<StrengthExerciseDto> Exercises,
    IReadOnlyList<SessionStepDto> Steps);

/// <summary>
/// One step of a session, the way a runner follows it on the day: a distance (<c>DistanceKm</c>) or a time
/// (<c>DurationSeconds</c>), at a pace range (<c>FastestSecondsPerKm</c> to <c>SlowestSecondsPerKm</c>) or, where a pace says
/// little, by feel (<c>Effort</c>). A <c>Repeat</c> step does its <c>Steps</c> <c>Times</c> times.
/// </summary>
public sealed record SessionStepDto(
    StepKind Kind,
    double? DistanceKm,
    double? DurationSeconds,
    PaceZone? Zone,
    double? FastestSecondsPerKm,
    double? SlowestSecondsPerKm,
    string? Effort,
    int Times,
    IReadOnlyList<SessionStepDto> Steps)
{
    public static SessionStepDto From(SessionStep step)
    {
        ArgumentNullException.ThrowIfNull(step);
        return new(
            step.Kind,
            step.DistanceKm is { } km ? Math.Round(km, 2) : null,
            step.Duration?.TotalSeconds,
            step.Zone,
            step.Pace is { } fastest ? Math.Round(fastest.Fastest.SecondsPerKilometre) : null,
            step.Pace is { } slowest ? Math.Round(slowest.Slowest.SecondsPerKilometre) : null,
            step.Effort,
            step.Times,
            step.Block?.Select(From).ToList() ?? []);
    }
}

/// <summary>
/// One move in a strength session, listed in the order to do them; <c>Reps</c> counts seconds when the unit is a hold.
/// <c>Summary</c> is the same in words ("3 × 8 reverse lunges each leg"), for calendars.
/// </summary>
public sealed record StrengthExerciseDto(Exercise Exercise, int Sets, int Reps, RepUnit Unit, string Summary);

public sealed record PlanWarningDto(string Code, string Message);
