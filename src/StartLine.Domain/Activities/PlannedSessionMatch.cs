using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Activities;

/// <summary>
/// What the plan said for the day of a run, frozen when the run is imported. Plans regenerate when a race date
/// moves, but what was asked of the runner on that day shouldn't change afterwards. Paces are seconds per km.
/// </summary>
public sealed record PlannedSessionMatch(
    string PlanName,
    SessionType SessionType,
    string Title,
    double DistanceKm,
    double? FastestPaceSecondsPerKm,
    double? SlowestPaceSecondsPerKm,
    PaceZone? Zone = null,
    WorkShape Shape = WorkShape.Steady,
    double WorkKm = 0,
    PaceZone? WorkZone = null,
    double? WorkFastestPaceSecondsPerKm = null,
    double? WorkSlowestPaceSecondsPerKm = null,
    double? RepMetres = null,
    double? EasyFastestPaceSecondsPerKm = null,
    double? EasySlowestPaceSecondsPerKm = null,
    double? GoalPaceSecondsPerKm = null,
    string? NextTitle = null,
    DateOnly? NextDate = null)
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

    /// <summary>The metres of a run that hold the session's real work: the work block, one rep, or nothing to time.</summary>
    internal double? WorkMetres => Shape switch
    {
        WorkShape.Continuous when WorkKm > 0 => WorkKm * 1000,
        WorkShape.Reps => RepMetres,
        _ => null,
    };
}

public enum PaceVerdict
{
    /// <summary>The session had no target pace, or one a watch can't judge (hills, fartlek).</summary>
    NoTarget,
    Faster,
    OnTarget,
    Slower,
}

/// <summary>Which part of a run its pace verdict is about.</summary>
public enum JudgedPart
{
    /// <summary>An easy run, a long run or a race: the whole thing is the session.</summary>
    WholeRun,

    /// <summary>The tempo, fast finish or race-pace block: the fastest stretch of its length.</summary>
    WorkBlock,

    /// <summary>Repeats: the fastest stretch of one rep's length.</summary>
    FastestRep,

    /// <summary>Nothing a watch can judge.</summary>
    None,
}

/// <summary>Planned versus what was run: "planned 16 km at 5:40–6:05/km, you ran 16.4 km at 5:52/km".</summary>
public sealed record PlanComparison(
    double PlannedKm,
    double ActualKm,
    double ActualPaceSecondsPerKm,
    JudgedPart Judged,
    double? JudgedPaceSecondsPerKm,
    double? TargetFastestSecondsPerKm,
    double? TargetSlowestSecondsPerKm,
    PaceVerdict Pace,
    double SecondsPerKmOffTarget)
{
    public double DistanceDifferenceKm => ActualKm - PlannedKm;

    /// <summary>Compares a whole run with a session that asked for one steady effort.</summary>
    public static PlanComparison Of(PlannedSessionMatch planned, double actualKm, double actualPaceSecondsPerKm) =>
        Of(planned, actualKm, actualPaceSecondsPerKm, JudgedPart.WholeRun, actualPaceSecondsPerKm);

    public static PlanComparison Of(
        PlannedSessionMatch planned, double actualKm, double actualPaceSecondsPerKm, JudgedPart judged, double? judgedPace)
    {
        ArgumentNullException.ThrowIfNull(planned);
        var (fastest, slowest) = judged switch
        {
            JudgedPart.WholeRun => (planned.FastestPaceSecondsPerKm, planned.SlowestPaceSecondsPerKm),
            JudgedPart.WorkBlock or JudgedPart.FastestRep => (planned.WorkFastestPaceSecondsPerKm, planned.WorkSlowestPaceSecondsPerKm),
            _ => (null, null),
        };
        var (verdict, off) = Verdict(judgedPace, fastest, slowest);
        return new PlanComparison(planned.DistanceKm, actualKm, actualPaceSecondsPerKm, judged, judgedPace, fastest, slowest, verdict, off);
    }

    internal static (PaceVerdict Verdict, double Off) Verdict(double? pace, double? fastest, double? slowest) => (pace, fastest, slowest) switch
    {
        (null, _, _) or (_, null, null) => (PaceVerdict.NoTarget, 0d),
        ({ } p, { } f, _) when p < f => (PaceVerdict.Faster, f - p),
        ({ } p, _, { } s) when p > s => (PaceVerdict.Slower, p - s),
        _ => (PaceVerdict.OnTarget, 0d),
    };
}
