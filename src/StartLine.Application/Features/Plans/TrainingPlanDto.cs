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
    IReadOnlyList<PlanWarningDto> Warnings)
{
    public static TrainingPlanDto From(TrainingPlan plan, RaceSummaryDto race)
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
                    [.. (s.Exercises ?? []).Select(e => new StrengthExerciseDto(e.Exercise, e.Sets, e.Reps, e.Unit))]))]))],
            [.. plan.Warnings.Select(w => new PlanWarningDto(w.Code, w.Message))]);
    }
}

public sealed record RaceSummaryDto(string? Slug, string Name, DateOnly Date, double DistanceKm);

public sealed record PaceZoneDto(PaceZone Zone, double FastestSecondsPerKm, double SlowestSecondsPerKm);

public sealed record PlanWeekDto(
    int Number,
    DateOnly StartDate,
    TrainingPhase Phase,
    bool IsCutback,
    double PlannedKm,
    IReadOnlyList<SessionDto> Sessions);

public sealed record SessionDto(
    DateOnly Date,
    SessionType Type,
    string Title,
    string Detail,
    string Purpose,
    double DistanceKm,
    PaceZone? Zone,
    IReadOnlyList<StrengthExerciseDto> Exercises);

/// <summary>One move in a strength session; <c>Reps</c> counts seconds when the unit is a hold.</summary>
public sealed record StrengthExerciseDto(Exercise Exercise, int Sets, int Reps, RepUnit Unit);

public sealed record PlanWarningDto(string Code, string Message);
