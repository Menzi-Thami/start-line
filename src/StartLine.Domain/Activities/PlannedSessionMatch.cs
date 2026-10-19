using StartLine.Domain.Plans;

namespace StartLine.Domain.Activities;

/// <summary>
/// What the plan said for the day of a run, frozen when the run is imported. Plans regenerate when a race date
/// moves, but what was asked of the runner on that day shouldn't change afterwards.
/// </summary>
public sealed record PlannedSessionMatch(
    string PlanName,
    SessionType SessionType,
    string Title,
    double DistanceKm,
    double? FastestPaceSecondsPerKm,
    double? SlowestPaceSecondsPerKm)
{
    public const int MaxPlanNameLength = SavedPlan.MaxNameLength;
    public const int MaxTitleLength = 100;

    /// <summary>
    /// Picks the session a run was meant to be. Strength sessions never match a run. With several plans (or
    /// several runs that day), the one whose distance is closest to what was run wins.
    /// </summary>
    public static PlannedSessionMatch? Pick(IEnumerable<PlannedSessionMatch> candidates, double actualKm)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        return candidates
            .Where(c => c.SessionType != SessionType.Strength && c.DistanceKm > 0)
            .OrderBy(c => Math.Abs(c.DistanceKm - actualKm))
            .FirstOrDefault();
    }
}

public enum PaceVerdict
{
    /// <summary>The session had no target pace (a race, or a run by feel).</summary>
    NoTarget,
    Faster,
    OnTarget,
    Slower,
}

/// <summary>Planned versus what was run: "planned 16 km at 5:40–6:05/km, you ran 16.4 km at 5:52/km".</summary>
public sealed record PlanComparison(
    double PlannedKm,
    double ActualKm,
    double? FastestPaceSecondsPerKm,
    double? SlowestPaceSecondsPerKm,
    double ActualPaceSecondsPerKm,
    PaceVerdict Pace,
    double SecondsPerKmOffTarget)
{
    public double DistanceDifferenceKm => ActualKm - PlannedKm;

    public static PlanComparison Of(PlannedSessionMatch planned, double actualKm, double actualPaceSecondsPerKm)
    {
        ArgumentNullException.ThrowIfNull(planned);
        var (verdict, off) = (planned.FastestPaceSecondsPerKm, planned.SlowestPaceSecondsPerKm) switch
        {
            ({ } fastest, _) when actualPaceSecondsPerKm < fastest => (PaceVerdict.Faster, fastest - actualPaceSecondsPerKm),
            (_, { } slowest) when actualPaceSecondsPerKm > slowest => (PaceVerdict.Slower, actualPaceSecondsPerKm - slowest),
            (null, null) => (PaceVerdict.NoTarget, 0d),
            _ => (PaceVerdict.OnTarget, 0d),
        };
        return new PlanComparison(planned.DistanceKm, actualKm, planned.FastestPaceSecondsPerKm, planned.SlowestPaceSecondsPerKm,
            actualPaceSecondsPerKm, verdict, off);
    }
}
