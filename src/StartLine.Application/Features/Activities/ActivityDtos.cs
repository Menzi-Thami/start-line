using System.Globalization;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

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

    internal static double? Round(double? value, int digits) => value is { } v ? Round(v, digits) : null;
}

/// <summary>
/// Everything the activity page shows, with the review worked out: how each km sat against the pace it was meant
/// for, a fast start, a fade, heart-rate drift and zones. Wording is the client's job; these are the facts.
/// </summary>
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
    ReviewDto Review,
    IReadOnlyList<SplitDto> Splits,
    HalvesDto Halves,
    IReadOnlyList<BestEffortDto> BestEfforts,
    HeartRateDto? HeartRate)
{
    /// <param name="bestFromOtherRuns">The runner's fastest time per standard distance across their other runs.</param>
    /// <param name="runnerMaxHeartRate">The max heart rate the runner set, or null: no zones without it.</param>
    public static ActivityDto From(Activity a, IReadOnlyDictionary<double, TimeSpan> bestFromOtherRuns, int? runnerMaxHeartRate)
    {
        ArgumentNullException.ThrowIfNull(a);
        var review = a.Review();
        var quickest = review.QuickestSplit;
        var hardest = review.HardestSplit;
        var isRace = a.PlannedSession?.SessionType == SessionType.Race;
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
            a.PlannedSession is { } planned && review.Plan is { } comparison ? PlannedVsActualDto.From(planned, comparison) : null,
            ReviewDto.From(review),
            [.. a.Splits.Zip(review.Splits, (s, score) => SplitDto.From(s, score, s.Number == quickest, s.Number == hardest))],
            HalvesDto.From(a.Halves),
            [.. a.BestEfforts.OrderBy(e => e.DistanceMetres).Select(e => BestEffortDto.From(e, bestFromOtherRuns, isRace))],
            HeartRateDto.From(a, runnerMaxHeartRate));
    }
}

public sealed record PlannedVsActualDto(
    string PlanName,
    SessionType SessionType,
    string Title,
    WorkShape Shape,
    PaceZone? Zone,
    PaceZone? WorkZone,
    double WorkKm,
    double? RepMetres,
    double PlannedKm,
    double ActualKm,
    double ActualPaceSecondsPerKm,
    double DistanceDifferenceKm,
    JudgedPart Judged,
    double? JudgedPaceSecondsPerKm,
    double? TargetFastestSecondsPerKm,
    double? TargetSlowestSecondsPerKm,
    PaceVerdict Pace,
    double SecondsPerKmOffTarget,
    double? GoalPaceSecondsPerKm,
    string? NextTitle,
    DateOnly? NextDate)
{
    public static PlannedVsActualDto From(PlannedSessionMatch planned, PlanComparison c)
    {
        ArgumentNullException.ThrowIfNull(planned);
        ArgumentNullException.ThrowIfNull(c);
        return new(planned.PlanName, planned.SessionType, planned.Title, planned.Shape, planned.Zone, planned.WorkZone,
            planned.WorkKm, planned.RepMetres, c.PlannedKm, ActivitySummaryDto.Round(c.ActualKm, 2),
            ActivitySummaryDto.Round(c.ActualPaceSecondsPerKm, 1), ActivitySummaryDto.Round(c.DistanceDifferenceKm, 2), c.Judged,
            ActivitySummaryDto.Round(c.JudgedPaceSecondsPerKm, 1), c.TargetFastestSecondsPerKm, c.TargetSlowestSecondsPerKm, c.Pace,
            Math.Round(c.SecondsPerKmOffTarget), planned.GoalPaceSecondsPerKm, planned.NextTitle, planned.NextDate);
    }
}

public sealed record ReviewDto(
    double? StartedFastBySecondsPerKm,
    int? FadeFromSplit,
    DistanceFit? Distance,
    double? GoalPaceGapSecondsPerKm,
    double? HeartRateDriftPercent,
    bool HeartRateDriftIsNotable)
{
    public static ReviewDto From(RunReview r)
    {
        ArgumentNullException.ThrowIfNull(r);
        return new(ActivitySummaryDto.Round(r.StartedFastBySecondsPerKm, 0), r.FadeFromSplit, r.Distance,
            ActivitySummaryDto.Round(r.GoalPaceGapSecondsPerKm, 0), r.HeartRateDriftPercent,
            r.HeartRateDriftPercent > HeartRateZones.NotableDriftPercent);
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
    bool IsHardest,
    SplitRole Role,
    PaceZone? Zone,
    ZoneFit Fit,
    double SecondsPerKmOffZone)
{
    public static SplitDto From(Split s, SplitScore score, bool isQuickest, bool isHardest)
    {
        ArgumentNullException.ThrowIfNull(s);
        ArgumentNullException.ThrowIfNull(score);
        return new(s.Number, ActivitySummaryDto.Round(s.DistanceMetres / 1000, 2), ActivitySummaryDto.Round(s.MovingTime.TotalSeconds, 1),
            ActivitySummaryDto.Round(s.PaceSecondsPerKm, 1), s.ElevationChangeMetres, s.AverageHeartRate, isQuickest, isHardest,
            score.Role, score.Zone, score.Fit, score.SecondsPerKmOffZone);
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

public sealed record BestEffortDto(
    string Name,
    double DistanceMetres,
    double Seconds,
    double PaceSecondsPerKm,
    EffortStanding Standing,
    double? PreviousBestSeconds,
    bool IsWorthShowing)
{
    public static BestEffortDto From(BestEffort e, IReadOnlyDictionary<double, TimeSpan> bestFromOtherRuns, bool isRace)
    {
        ArgumentNullException.ThrowIfNull(e);
        ArgumentNullException.ThrowIfNull(bestFromOtherRuns);
        var standing = Domain.Activities.BestEfforts.Standing(e, bestFromOtherRuns);
        return new(StandardDistance.Find(e.DistanceMetres)?.Name ?? string.Create(CultureInfo.InvariantCulture, $"{e.DistanceMetres:0} m"),
            e.DistanceMetres, ActivitySummaryDto.Round(e.Elapsed.TotalSeconds, 1), ActivitySummaryDto.Round(e.PaceSecondsPerKm, 1), standing,
            bestFromOtherRuns.TryGetValue(e.DistanceMetres, out var best) ? ActivitySummaryDto.Round(best.TotalSeconds, 1) : null,
            Domain.Activities.BestEfforts.IsWorthShowing(standing, isRace));
    }
}

/// <summary>Zones appear only when the runner has set a max heart rate; Taperday doesn't guess one.</summary>
public sealed record HeartRateDto(int? MaxHeartRateSetting, IReadOnlyList<HeartRateZoneDto>? Zones)
{
    public static HeartRateDto? From(Activity a, int? runnerMaxHeartRate)
    {
        ArgumentNullException.ThrowIfNull(a);
        if (a.HeartRateTime.Count == 0)
        {
            return null;
        }

        return new HeartRateDto(
            runnerMaxHeartRate,
            runnerMaxHeartRate is { } max
                ? [.. HeartRateZones.TimeIn(a.HeartRateTime, max).Select(z => new HeartRateZoneDto(z.Zone, z.FromBpm, z.ToBpm, z.Seconds))]
                : null);
    }
}

public sealed record HeartRateZoneDto(int Zone, int FromBpm, int ToBpm, double Seconds);
