using StartLine.Domain.Activities;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Coaching;

public enum CoachVerdict
{
    /// <summary>Too few runs checked in or recorded to judge: the plan runs as written.</summary>
    NotEnoughToGoOn,
    OnTrack,
    Struggling,

    /// <summary>Pain that changed how they ran. The coach eases off and offers the injury replan; it never replans by itself.</summary>
    Hurting,
    Thriving,
}

/// <summary>Why the coach decided what it did. Codes only: the client says them in Taperday's voice.</summary>
public enum CoachReason
{
    FewCheckIns,
    RanAsPlanned,
    FeltHarderThanPlanned,
    MissedVolume,
    HighHeartRateDrift,
    Niggles,
    Pain,
    FeltEasierThanPlanned,
    FasterThanPlanned,

    /// <summary>A second hard week running: the easier week comes now rather than later.</summary>
    StrugglingTwice,

    /// <summary>A second strong week running: the hard sessions step up.</summary>
    ThrivingTwice,

    /// <summary>The runner has just replanned: the rebuild already starts from where they are.</summary>
    JustReplanned,
}

/// <summary>
/// One planned run and what's known about how it went: what the runner said, and what a watch or app recorded.
/// Either can be missing.
/// </summary>
public sealed record RunEvidence(
    PlannedSession Session,
    CheckInAnswers? CheckIn,
    double? RecordedKm = null,
    PaceVerdict? Pace = null,
    double? HeartRateDriftPercent = null)
{
    public bool IsKnown => CheckIn is not null || RecordedKm is not null;
}

/// <summary>
/// The coach's call for one week, made once on or after its Monday from how the week before went, then kept: the
/// same decisions always give the same plan, even after the runs behind them have gone from a 7-day Strava cache.
/// <see cref="DoseStep"/> is -1 (one hard session, and a smaller one), 0 or +1 (a bigger hard session).
/// </summary>
public sealed record CoachDecision(
    DateOnly WeekStart,
    CoachVerdict Verdict,
    bool HoldVolume,
    int DoseStep,
    bool CutbackNow,
    IReadOnlyList<CoachReason> Reasons)
{
    public static CoachDecision AsPlanned(DateOnly weekStart, CoachVerdict verdict, params CoachReason[] reasons) =>
        new(weekStart, verdict, HoldVolume: false, DoseStep: 0, CutbackNow: false, reasons);

    public bool ChangesThePlan => HoldVolume || DoseStep != 0 || CutbackNow;
}

/// <summary>
/// The weekly coach: reads last week's runs and decides whether this week holds, eases, steps up or runs as planned.
/// Small changes only, within every training rule; anything bigger (a new goal, an injury replan) is offered to the
/// runner, never made. Every threshold is a named constant with a test.
/// </summary>
public static class WeeklyCoach
{
    /// <summary>At least this share of last week's runs needs a check-in or a recorded run to judge the week.</summary>
    public const double KnownShare = 0.5;

    /// <summary>Under this share of the planned km run is a missed week.</summary>
    public const double MissedVolumeShare = 0.7;

    /// <summary>At least this share of the planned km run counts as the full week.</summary>
    public const double FullVolumeShare = 0.95;

    /// <summary>A run felt this many points above the top of how it should feel is "harder than planned".</summary>
    public const int FeltHarderBy = 2;

    /// <summary>A hard session felt this many points below the bottom of how it should feel is "easier than planned".</summary>
    public const int FeltEasierBy = 2;

    /// <summary>This many runs harder than planned in a week, and the week was too much.</summary>
    public const int HardRunsToStruggle = 2;

    /// <summary>Heart rate drifting more than this on an easy run says the aerobic load is high.</summary>
    public const double HighDriftPercent = 5;

    /// <summary>This many easy runs with high drift, and the week was too much.</summary>
    public const int DriftingRunsToStruggle = 2;

    /// <summary>This many runs with a niggle in a week, and the coach eases off before it becomes pain.</summary>
    public const int NigglesToStruggle = 2;

    /// <summary>A cut-short run counts as this share of its planned distance when no distance was given.</summary>
    public const double CutShortShare = 0.5;

    public static CoachDecision Decide(DateOnly weekStart, IReadOnlyList<RunEvidence> lastWeek, CoachDecision? previous)
    {
        ArgumentNullException.ThrowIfNull(lastWeek);
        var runs = lastWeek.Where(e => SessionCheckIn.IsCheckable(e.Session.Type)).ToList();
        var known = runs.Where(e => e.IsKnown).ToList();
        if (runs.Count == 0 || known.Count < runs.Count * KnownShare)
        {
            return CoachDecision.AsPlanned(weekStart, CoachVerdict.NotEnoughToGoOn, CoachReason.FewCheckIns);
        }

        var hadAHardWeek = previous?.Verdict is CoachVerdict.Struggling or CoachVerdict.Hurting;
        if (known.Any(e => e.CheckIn?.Pain == PainLevel.ChangedRunning))
        {
            return new CoachDecision(weekStart, CoachVerdict.Hurting, HoldVolume: true, DoseStep: -1, CutbackNow: hadAHardWeek,
                hadAHardWeek ? [CoachReason.Pain, CoachReason.StrugglingTwice] : [CoachReason.Pain]);
        }

        var plannedKm = known.Sum(e => e.Session.DistanceKm);
        var ranKm = known.Sum(KmRun);
        var struggles = new List<CoachReason>();
        if (known.Count(FeltHarder) >= HardRunsToStruggle)
        {
            struggles.Add(CoachReason.FeltHarderThanPlanned);
        }

        if (plannedKm > 0 && ranKm < plannedKm * MissedVolumeShare)
        {
            struggles.Add(CoachReason.MissedVolume);
        }

        if (known.Count(e => !ExpectedEffort.IsHard(e.Session.Type) && e.HeartRateDriftPercent > HighDriftPercent) >= DriftingRunsToStruggle)
        {
            struggles.Add(CoachReason.HighHeartRateDrift);
        }

        if (known.Count(e => e.CheckIn?.Pain == PainLevel.Niggle) >= NigglesToStruggle)
        {
            struggles.Add(CoachReason.Niggles);
        }

        if (struggles.Count > 0)
        {
            if (hadAHardWeek)
            {
                struggles.Add(CoachReason.StrugglingTwice);
            }

            return new CoachDecision(weekStart, CoachVerdict.Struggling, HoldVolume: true, DoseStep: -1, CutbackNow: hadAHardWeek, struggles);
        }

        var hard = known.Where(e => ExpectedEffort.IsHard(e.Session.Type)).ToList();
        var ranItAll = plannedKm > 0 && ranKm >= plannedKm * FullVolumeShare;
        if (ranItAll && hard.Count > 0 && hard.All(e => FeltEasier(e) || e.Pace == PaceVerdict.Faster))
        {
            var reasons = new List<CoachReason>
            {
                hard.Any(FeltEasier) ? CoachReason.FeltEasierThanPlanned : CoachReason.FasterThanPlanned,
            };

            // One strong week is encouraging; two in a row is a pattern worth building on.
            var twice = previous?.Verdict == CoachVerdict.Thriving;
            if (twice)
            {
                reasons.Add(CoachReason.ThrivingTwice);
            }

            return new CoachDecision(weekStart, CoachVerdict.Thriving, HoldVolume: false, DoseStep: twice ? 1 : 0, CutbackNow: false, reasons);
        }

        return CoachDecision.AsPlanned(weekStart, CoachVerdict.OnTrack, CoachReason.RanAsPlanned);
    }

    private static double KmRun(RunEvidence e) =>
        e.CheckIn?.DistanceKm ?? e.RecordedKm ?? e.CheckIn?.Status switch
        {
            CheckInStatus.Skipped => 0,
            CheckInStatus.CutShort => e.Session.DistanceKm * CutShortShare,
            _ => e.Session.DistanceKm,
        };

    private static bool FeltHarder(RunEvidence e) =>
        e.CheckIn?.Effort is { } effort && ExpectedEffort.For(e.Session.Type) is { } expected && effort >= expected.High + FeltHarderBy;

    private static bool FeltEasier(RunEvidence e) =>
        e.CheckIn?.Effort is { } effort && ExpectedEffort.For(e.Session.Type) is { } expected && effort <= expected.Low - FeltEasierBy;
}

/// <summary>
/// How each kind of run should feel on the runner's 1–10 scale. The client shows the same ranges, so what the runner
/// is told to expect is what the coach judges against.
/// </summary>
public static class ExpectedEffort
{
    public static (int Low, int High)? For(SessionType type) => type switch
    {
        SessionType.Easy => (2, 4),
        SessionType.Recovery => (2, 3),
        SessionType.EasyWithStrides => (3, 4),
        SessionType.Hills => (7, 8),
        SessionType.Fartlek => (6, 8),
        SessionType.Intervals => (7, 8),
        SessionType.Tempo or SessionType.CruiseIntervals => (6, 7),
        SessionType.ProgressionRun => (5, 7),
        SessionType.RacePace => (6, 8),
        SessionType.MediumLongRun or SessionType.LongRun => (3, 5),
        SessionType.LongRunFastFinish => (4, 6),
        SessionType.LongRunRacePace => (5, 7),
        SessionType.Shakeout => (2, 3),
        _ => null,
    };

    /// <summary>The week's hard sessions: the ones the dose of the plan rides on.</summary>
    public static bool IsHard(SessionType type) => type is SessionType.Hills or SessionType.Fartlek or SessionType.Intervals
        or SessionType.Tempo or SessionType.CruiseIntervals or SessionType.ProgressionRun or SessionType.RacePace;
}
