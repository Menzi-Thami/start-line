using System.Globalization;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Activities;

public sealed record ActivitySummaryDto(
    Guid Id,
    DateTimeOffset StartedAt,
    DateOnly LocalDate,
    ActivityKind Kind,
    double DistanceKm,
    double MovingSeconds,
    double PaceSecondsPerKm,
    string? PlannedTitle)
{
    public static ActivitySummaryDto From(Activity a)
    {
        ArgumentNullException.ThrowIfNull(a);
        return new(a.Id, a.StartedAt, a.LocalDate, a.Kind, Round(a.DistanceKm, 2), Math.Round(a.MovingTime.TotalSeconds),
            Round(a.PaceSecondsPerKm, 1), a.PlannedSession?.Title);
    }

    internal static double Round(double value, int digits) => Math.Round(value, digits, MidpointRounding.AwayFromZero);
}

/// <summary>Everything the activity page shows. Personal bests are judged against every run the runner has stored.</summary>
public sealed record ActivityDto(
    Guid Id,
    DateTimeOffset StartedAt,
    DateOnly LocalDate,
    ActivityKind Kind,
    double DistanceKm,
    double MovingSeconds,
    double ElapsedSeconds,
    double PaceSecondsPerKm,
    double? ElevationGainMetres,
    int? AverageHeartRate,
    int? MaxHeartRate,
    int? Calories,
    PlannedVsActualDto? Plan,
    IReadOnlyList<SplitDto> Splits,
    HalvesDto Halves,
    IReadOnlyList<BestEffortDto> BestEfforts)
{
    public static ActivityDto From(Activity a, IReadOnlyDictionary<double, TimeSpan> fastestByDistance)
    {
        ArgumentNullException.ThrowIfNull(a);
        var quickest = Domain.Activities.Splits.Quickest(a.Splits)?.Number;
        var hardest = Domain.Activities.Splits.Hardest(a.Splits)?.Number;
        return new(
            a.Id,
            a.StartedAt,
            a.LocalDate,
            a.Kind,
            ActivitySummaryDto.Round(a.DistanceKm, 2),
            Math.Round(a.MovingTime.TotalSeconds),
            Math.Round(a.ElapsedTime.TotalSeconds),
            ActivitySummaryDto.Round(a.PaceSecondsPerKm, 1),
            a.ElevationGainMetres is { } gain ? Math.Round(gain) : null,
            a.AverageHeartRate,
            a.MaxHeartRate,
            a.Calories,
            a.PlannedSession is { } planned && a.ComparedWithPlan is { } comparison ? PlannedVsActualDto.From(planned, comparison) : null,
            [.. a.Splits.Select(s => SplitDto.From(s, s.Number == quickest, s.Number == hardest))],
            HalvesDto.From(a.Halves),
            [.. a.BestEfforts.OrderBy(e => e.DistanceMetres).Select(e => BestEffortDto.From(e, fastestByDistance))]);
    }
}

public sealed record PlannedVsActualDto(
    string PlanName,
    SessionType SessionType,
    string Title,
    double PlannedKm,
    double? FastestPaceSecondsPerKm,
    double? SlowestPaceSecondsPerKm,
    double ActualKm,
    double ActualPaceSecondsPerKm,
    double DistanceDifferenceKm,
    PaceVerdict Pace,
    double SecondsPerKmOffTarget)
{
    public static PlannedVsActualDto From(PlannedSessionMatch planned, PlanComparison c)
    {
        ArgumentNullException.ThrowIfNull(planned);
        ArgumentNullException.ThrowIfNull(c);
        return new(planned.PlanName, planned.SessionType, planned.Title, c.PlannedKm, c.FastestPaceSecondsPerKm, c.SlowestPaceSecondsPerKm,
            ActivitySummaryDto.Round(c.ActualKm, 2), ActivitySummaryDto.Round(c.ActualPaceSecondsPerKm, 1),
            ActivitySummaryDto.Round(c.DistanceDifferenceKm, 2), c.Pace, Math.Round(c.SecondsPerKmOffTarget));
    }
}

public sealed record SplitDto(
    int Number,
    double DistanceKm,
    double MovingSeconds,
    double PaceSecondsPerKm,
    double? ElevationChangeMetres,
    int? AverageHeartRate,
    bool IsQuickest,
    bool IsHardest)
{
    public static SplitDto From(Split s, bool isQuickest, bool isHardest)
    {
        ArgumentNullException.ThrowIfNull(s);
        return new(s.Number, ActivitySummaryDto.Round(s.DistanceMetres / 1000, 2), ActivitySummaryDto.Round(s.MovingTime.TotalSeconds, 1),
            ActivitySummaryDto.Round(s.PaceSecondsPerKm, 1), s.ElevationChangeMetres, s.AverageHeartRate, isQuickest, isHardest);
    }
}

public sealed record HalvesDto(
    double FirstHalfPaceSecondsPerKm,
    double SecondHalfPaceSecondsPerKm,
    double SecondHalfSlowerBySecondsPerKm,
    PacingVerdict Verdict)
{
    public static HalvesDto From(Halves h)
    {
        ArgumentNullException.ThrowIfNull(h);
        return new(ActivitySummaryDto.Round(h.FirstHalfPaceSecondsPerKm, 1), ActivitySummaryDto.Round(h.SecondHalfPaceSecondsPerKm, 1),
            ActivitySummaryDto.Round(h.SecondHalfSlowerBySecondsPerKm, 1), h.Verdict);
    }
}

public sealed record BestEffortDto(string Name, double DistanceMetres, double Seconds, double PaceSecondsPerKm, bool IsPersonalBest)
{
    public static BestEffortDto From(BestEffort e, IReadOnlyDictionary<double, TimeSpan> fastestByDistance)
    {
        ArgumentNullException.ThrowIfNull(e);
        return new(StandardDistance.Find(e.DistanceMetres)?.Name ?? string.Create(CultureInfo.InvariantCulture, $"{e.DistanceMetres:0} m"), e.DistanceMetres,
            ActivitySummaryDto.Round(e.Elapsed.TotalSeconds, 1), ActivitySummaryDto.Round(e.PaceSecondsPerKm, 1),
            Domain.Activities.BestEfforts.IsPersonalBest(e, fastestByDistance));
    }
}
