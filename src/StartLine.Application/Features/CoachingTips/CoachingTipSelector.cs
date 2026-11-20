using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.CoachingTips;

/// <summary>
/// What decides a runner's tip on one Thursday, read fresh when it's due. The long-run jump and easy paces come from kept
/// runs only; only "ran last week" also counts the Strava runs held now. Used for this choice and this email, never stored.
/// </summary>
/// <param name="Thursday">The runner's own Thursday the tip goes on.</param>
/// <param name="RaceDate">The current plan's race day; null without a current plan.</param>
/// <param name="Track">The runner's track for the weekly tips.</param>
/// <param name="LongestLastWeekKm">The longest single run in the seven days to yesterday; null when there's none with a distance.</param>
/// <param name="LongestBeforeKm">The longest single run in the 30 days before those seven; null when there's none.</param>
/// <param name="PlannedLastWeek">The current plan had running sessions in the seven days to yesterday (since it was made).</param>
/// <param name="RanLastWeek">A run was logged in the seven days to yesterday.</param>
/// <param name="EasyRuns">
/// Kept runs (uploads, and check-ins with both a distance and a time) in the seven days to yesterday on days whose planned
/// session was easy: Easy, Recovery, or EasyWithStrides (its easy part). Never Strava runs. Empty without a current plan.
/// </param>
/// <param name="EasyPaces">The current plan's easy pace range; null without one.</param>
/// <param name="Units">The runner's units, for paces in the email.</param>
public sealed record CoachingTipFacts(
    DateOnly Thursday,
    DateOnly? RaceDate,
    CoachingTrack Track,
    double? LongestLastWeekKm = null,
    double? LongestBeforeKm = null,
    bool PlannedLastWeek = false,
    bool RanLastWeek = false,
    IReadOnlyList<EasyRunPace>? EasyRuns = null,
    PaceRange? EasyPaces = null,
    Units Units = Units.Kilometres);

/// <summary>One kept easy run's pace and distance, read for this choice only and never stored.</summary>
public sealed record EasyRunPace(double SecondsPerKm, double Km);

/// <summary>A tip already sent (or mid-send) to this runner, on their Thursday.</summary>
public sealed record PastCoachingTip(DateOnly Thursday, string Key);

/// <summary>Why a tip was chosen: which rule matched first.</summary>
public enum CoachingTipReason { RaceWeek, Taper, LongRunJump, EasyTooFast, Comeback, Track, Rotation }

/// <summary>The tip to send, already in the runner's own numbers where it has any.</summary>
public sealed record CoachingTipChoice(CoachingTip Tip, CoachingTipReason Reason);

/// <summary>
/// Which tip a runner gets on a Thursday. First match wins: race week, the taper, a long-run jump, easy runs run too
/// fast, a quiet week on the plan, then the next step on their track (and after its twelve, the rotation, round and round). An override tip sent in
/// the last four weeks is never sent again: the rules fall through to the next one instead. Every threshold is a named
/// constant with a test (CoachingTipSelectionTests).
/// </summary>
public static class CoachingTipSelector
{
    /// <summary>Race week: the race is this many days after the Thursday, or fewer (0 is race day itself).</summary>
    public const int RaceWeekDays = 6;

    /// <summary>The taper: the race is more than <see cref="RaceWeekDays"/> and up to this many days away.</summary>
    public const int TaperDays = 20;

    /// <summary>A long run more than this share above the month before's longest is a jump. Exactly 10% isn't.</summary>
    public const double LongRunJumpShare = 0.10;

    /// <summary>Without an earlier run at least this long there's nothing fair to compare with, so no jump is called.</summary>
    public const double MinEarlierLongestKm = 2;

    /// <summary>An easy run more than this many seconds per km quicker than the fast end of the easy range is too fast. Exactly this isn't.</summary>
    public const double EasyTooFastSeconds = 10;

    /// <summary>At least this many easy runs must be too fast before the tip is sent.</summary>
    public const int MinEasyRunsTooFast = 2;

    /// <summary>And they must be at least this share of the week's easy runs that have a pace.</summary>
    public const double MinEasyShareTooFast = 0.5;

    /// <summary>The same override tip never goes twice within this many days.</summary>
    public const int NoRepeatDays = 28;

    public static CoachingTipChoice Choose(CoachingTipFacts facts, IEnumerable<PastCoachingTip> history)
    {
        ArgumentNullException.ThrowIfNull(facts);
        ArgumentNullException.ThrowIfNull(history);
        var past = history.Where(h => h.Thursday < facts.Thursday).ToList();

        if (facts.RaceDate is { } race)
        {
            var days = race.DayNumber - facts.Thursday.DayNumber;
            if (days is >= 0 and <= RaceWeekDays && Fresh(CoachingTipBank.RaceWeek, past, facts.Thursday) is { } raceTip)
            {
                return new(raceTip, CoachingTipReason.RaceWeek);
            }

            if (days is > RaceWeekDays and <= TaperDays && Fresh(CoachingTipBank.Taper, past, facts.Thursday) is { } taperTip)
            {
                return new(taperTip, CoachingTipReason.Taper);
            }
        }

        if (facts is { LongestLastWeekKm: { } longest, LongestBeforeKm: { } before } && IsLongRunJump(longest, before)
            && Fresh([CoachingTipBank.Spike], past, facts.Thursday) is not null)
        {
            return new(CoachingTipBank.LongRunJump(longest, before), CoachingTipReason.LongRunJump);
        }

        if (EasyTooFast(facts) is { } easyTip && Fresh([CoachingTipBank.EasyFast], past, facts.Thursday) is not null)
        {
            return new(easyTip, CoachingTipReason.EasyTooFast);
        }

        if (facts is { PlannedLastWeek: true, RanLastWeek: false } && (facts.RaceDate is null || facts.RaceDate >= facts.Thursday)
            && Fresh([CoachingTipBank.Comeback], past, facts.Thursday) is not null)
        {
            return new(CoachingTipBank.Comeback, CoachingTipReason.Comeback);
        }

        var track = CoachingTipBank.For(facts.Track);
        var step = past.Count(h => track.Any(t => t.Key == h.Key));
        if (step < track.Count)
        {
            return new(track[step], CoachingTipReason.Track);
        }

        var turn = past.Count(h => CoachingTipBank.Rotation.Any(t => t.Key == h.Key));
        return new(CoachingTipBank.Rotation[turn % CoachingTipBank.Rotation.Count], CoachingTipReason.Rotation);
    }

    /// <summary>
    /// A runner's track: new runners (no current plan, a current plan for a new runner, or a Couch to 5K programme under
    /// way) follow Track A; everyone else Track B.
    /// </summary>
    /// <param name="currentPlanExperience">The current plan's experience level; null without a current plan.</param>
    /// <param name="couchTo5KUnderway">A Couch to 5K programme started and not finished.</param>
    public static CoachingTrack TrackFor(Experience? currentPlanExperience, bool couchTo5KUnderway) =>
        currentPlanExperience is null or Experience.New || couchTo5KUnderway ? CoachingTrack.NewRunner : CoachingTrack.Improving;

    /// <summary>
    /// Whether the last week's longest run jumped more than <see cref="LongRunJumpShare"/> beyond the month before's, which
    /// needs an earlier run of at least <see cref="MinEarlierLongestKm"/>. Compared to the metre, so exactly 10% is no jump.
    /// </summary>
    public static bool IsLongRunJump(double longestKm, double earlierLongestKm) =>
        earlierLongestKm >= MinEarlierLongestKm
        && Math.Round(longestKm, 3) > Math.Round(earlierLongestKm * (1 + LongRunJumpShare), 3);

    /// <summary>
    /// Whether an easy run was more than <see cref="EasyTooFastSeconds"/> per km quicker than the fast end of the easy range.
    /// Compared to the tenth of a second, so exactly 10 s/km quicker isn't too fast.
    /// </summary>
    public static bool IsTooFastForEasy(double secondsPerKm, PaceRange easy)
    {
        ArgumentNullException.ThrowIfNull(easy);
        return Math.Round(secondsPerKm, 1) < Math.Round(easy.Fastest.SecondsPerKilometre - EasyTooFastSeconds, 1);
    }

    /// <summary>
    /// The "easy runs too fast" tip in the runner's own paces, when at least <see cref="MinEasyRunsTooFast"/> of last week's
    /// kept easy runs were too fast and they were at least <see cref="MinEasyShareTooFast"/> of those with a pace; otherwise
    /// null. The pace shown is the too-fast runs' average (total time over total distance).
    /// </summary>
    public static CoachingTip? EasyTooFast(CoachingTipFacts facts)
    {
        ArgumentNullException.ThrowIfNull(facts);
        if (facts is not { EasyPaces: { } easy, EasyRuns: { Count: > 0 } runs })
        {
            return null;
        }

        var paced = runs.Where(r => r.Km > 0 && r.SecondsPerKm > 0).ToList();
        var fast = paced.Where(r => IsTooFastForEasy(r.SecondsPerKm, easy)).ToList();
        if (fast.Count < MinEasyRunsTooFast || fast.Count < paced.Count * MinEasyShareTooFast)
        {
            return null;
        }

        var average = fast.Sum(r => r.SecondsPerKm * r.Km) / fast.Sum(r => r.Km);
        return CoachingTipBank.EasyTooFast(average, easy, facts.Units, fast.Count, paced.Count);
    }

    // The group's tips not sent in the last four weeks: one never sent first (in order), otherwise the one sent longest ago.
    private static CoachingTip? Fresh(IReadOnlyList<CoachingTip> group, List<PastCoachingTip> past, DateOnly thursday) => group
        .Where(t => !past.Any(h => h.Key == t.Key && thursday.DayNumber - h.Thursday.DayNumber < NoRepeatDays))
        .OrderBy(t => past.Where(h => h.Key == t.Key).Select(h => h.Thursday.DayNumber).DefaultIfEmpty(int.MinValue).Max())
        .FirstOrDefault();
}
