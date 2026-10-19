using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Activities;

/// <summary>The stretch of a run that held the session's real work, and how long it took on the clock.</summary>
public sealed record WorkWindow(double StartMetres, double Metres, TimeSpan Elapsed)
{
    public double EndMetres => StartMetres + Metres;

    public double PaceSecondsPerKm => Elapsed.TotalSeconds / (Metres / 1000);
}

public enum SplitRole
{
    /// <summary>A one-effort session (or an unplanned run): every km is the session.</summary>
    Steady,
    WarmUp,
    Work,
    CoolDown,
}

public enum ZoneFit
{
    /// <summary>No zone to judge against: an unplanned run, repeats, hills or fartlek.</summary>
    Unscored,
    Faster,
    In,
    Slower,
}

public enum DistanceFit
{
    ShorterThanPlanned,
    AsPlanned,
    LongerThanPlanned,
}

/// <summary>One km against the pace it was meant to be run at.</summary>
public sealed record SplitScore(int Number, SplitRole Role, PaceZone? Zone, ZoneFit Fit, double SecondsPerKmOffZone);

/// <summary>
/// How a run went against what it was for. Rules only, no wording: the client says it in Taperday's voice.
/// Every threshold below is a named constant with a test.
/// </summary>
public sealed record RunReview(
    PlanComparison? Plan,
    IReadOnlyList<SplitScore> Splits,
    double? StartedFastBySecondsPerKm,
    int? FadeFromSplit,
    DistanceFit? Distance,
    double? GoalPaceGapSecondsPerKm,
    double? HeartRateDriftPercent,
    int? QuickestSplit = null,
    int? HardestSplit = null)
{
    /// <summary>A km within this of its zone's edge still counts as in it: GPS and a gentle slope move pace this much.</summary>
    public const double ZoneGraceSecondsPerKm = 2;

    /// <summary>The first km (or first work km) this much quicker than its zone is a fast start.</summary>
    public const double FastStartSecondsPerKm = 5;

    /// <summary>A fade is pace this much slower than the opening kilometres, held from that km to the end.</summary>
    public const double FadeSecondsPerKm = 8;

    /// <summary>After a fade starts, no km gets back within this of the opening pace.</summary>
    public const double FadeHeldSecondsPerKm = 3;

    /// <summary>Fewer full km than this and there's no pattern to read.</summary>
    public const int FewestSplitsForAFade = 4;

    /// <summary>Within this share of the planned distance (or half a km) is as planned.</summary>
    public const double DistanceTolerance = 0.1;

    /// <summary>Heart-rate drift is only worth reading on a steady run at least this long.</summary>
    public static readonly TimeSpan ShortestRunForDrift = TimeSpan.FromMinutes(20);

    private static readonly SessionType[] GoalPaceSessions =
        [SessionType.LongRun, SessionType.LongRunFastFinish, SessionType.LongRunRacePace, SessionType.MediumLongRun, SessionType.Race];

    internal static RunReview Of(Activity run)
    {
        var planned = run.PlannedSession;
        var scores = run.Splits.Select(s => Score(s, planned, run.Work)).ToList();

        // Quickest and hardest only mean something within the effort itself: never a warm-up, a cool-down or a jog between reps.
        var effort = planned is { Shape: WorkShape.Reps or WorkShape.ByEffort }
            ? []
            : run.Splits.Where(s => scores.Single(c => c.Number == s.Number).Role is SplitRole.Steady or SplitRole.Work).ToList();

        return new RunReview(
            run.ComparedWithPlan,
            scores,
            StartedFast(run.Splits, scores),
            planned is { Shape: WorkShape.Reps or WorkShape.ByEffort } ? null : FadeFrom(run.Splits, scores),
            planned is null ? null : DistanceFitOf(planned.DistanceKm, run.DistanceKm),
            planned is { GoalPaceSecondsPerKm: { } goal } && GoalPaceSessions.Contains(planned.SessionType)
                ? Math.Round(run.PaceSecondsPerKm - goal, 1)
                : null,
            planned is null or { Shape: WorkShape.Steady } && run.MovingTime >= ShortestRunForDrift ? run.HeartRateDriftPercent : null,
            Domain.Activities.Splits.Quickest(effort)?.Number,
            Domain.Activities.Splits.Hardest(effort)?.Number);
    }

    private static SplitScore Score(Split split, PlannedSessionMatch? planned, WorkWindow? work)
    {
        var pace = split.PaceSecondsPerKm;
        switch (planned)
        {
            case { Shape: WorkShape.Steady }:
                return Scored(split.Number, SplitRole.Steady, planned.Zone, pace, planned.FastestPaceSecondsPerKm, planned.SlowestPaceSecondsPerKm);
            case { Shape: WorkShape.Continuous } when work is not null:
                // A km belongs to the work block if most of it was inside it.
                var end = split.Number * 1000d;
                var start = end - 1000;
                var overlap = Math.Min(end, work.EndMetres) - Math.Max(start, work.StartMetres);
                if (overlap >= Math.Min(split.DistanceMetres, work.Metres) / 2)
                {
                    return Scored(split.Number, SplitRole.Work, planned.WorkZone, pace, planned.WorkFastestPaceSecondsPerKm, planned.WorkSlowestPaceSecondsPerKm);
                }

                var role = end <= work.StartMetres ? SplitRole.WarmUp : SplitRole.CoolDown;
                return Scored(split.Number, role, PaceZone.Easy, pace, planned.EasyFastestPaceSecondsPerKm, planned.EasySlowestPaceSecondsPerKm);
            default:
                return new SplitScore(split.Number, SplitRole.Steady, null, ZoneFit.Unscored, 0);
        }
    }

    private static SplitScore Scored(int number, SplitRole role, PaceZone? zone, double pace, double? fastest, double? slowest) =>
        PlanComparison.Verdict(pace, fastest - ZoneGraceSecondsPerKm, slowest + ZoneGraceSecondsPerKm) switch
        {
            (PaceVerdict.Faster, var off) => new(number, role, zone, ZoneFit.Faster, Math.Round(off)),
            (PaceVerdict.Slower, var off) => new(number, role, zone, ZoneFit.Slower, Math.Round(off)),
            (PaceVerdict.OnTarget, _) => new(number, role, zone, ZoneFit.In, 0),
            _ => new(number, role, zone, ZoneFit.Unscored, 0),
        };

    /// <summary>How much quicker than its zone the first km of the effort was, when that's a fast start.</summary>
    private static double? StartedFast(IReadOnlyList<Split> splits, List<SplitScore> scores)
    {
        var first = scores.FirstOrDefault(s => s.Role is SplitRole.Steady or SplitRole.Work);
        return first is { Fit: ZoneFit.Faster } && first.SecondsPerKmOffZone + ZoneGraceSecondsPerKm >= FastStartSecondsPerKm
            && splits.Single(s => s.Number == first.Number).IsFullKilometre
            ? first.SecondsPerKmOffZone + ZoneGraceSecondsPerKm
            : null;
    }

    /// <summary>
    /// The km a fade started: the first one at least <see cref="FadeSecondsPerKm"/> slower than the opening half of
    /// the effort, staying that slow on average to the end, with no km after it getting back within
    /// <see cref="FadeHeldSecondsPerKm"/> of the opening. One hilly km isn't a fade.
    /// </summary>
    private static int? FadeFrom(IReadOnlyList<Split> splits, List<SplitScore> scores)
    {
        var effort = splits
            .Where(s => s.IsFullKilometre && scores.Single(c => c.Number == s.Number).Role is SplitRole.Steady or SplitRole.Work)
            .ToList();
        if (effort.Count < FewestSplitsForAFade)
        {
            return null;
        }

        var opening = effort.Take(effort.Count / 2).Average(s => s.PaceSecondsPerKm);
        for (var k = 1; k < effort.Count; k++)
        {
            var rest = effort.Skip(k).ToList();
            if (rest[0].PaceSecondsPerKm >= opening + FadeSecondsPerKm
                && rest.Average(s => s.PaceSecondsPerKm) >= opening + FadeSecondsPerKm
                && rest.All(s => s.PaceSecondsPerKm >= opening + FadeHeldSecondsPerKm))
            {
                return rest[0].Number;
            }
        }

        return null;
    }

    private static DistanceFit DistanceFitOf(double plannedKm, double actualKm)
    {
        var tolerance = Math.Max(0.5, plannedKm * DistanceTolerance);
        return actualKm < plannedKm - tolerance ? DistanceFit.ShorterThanPlanned
            : actualKm > plannedKm + tolerance ? DistanceFit.LongerThanPlanned
            : DistanceFit.AsPlanned;
    }
}
