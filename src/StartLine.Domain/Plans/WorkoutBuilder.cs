using System.Globalization;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>
/// Turns a session type into concrete distances and instructions. The same session type is shaped
/// differently per race distance: a 5K runner's intervals are short and sharp, a marathoner's are
/// longer, and an ultra runner's hills are long climbs with the descents practised too.
/// </summary>
internal sealed class WorkoutBuilder(
    DistanceCategory category,
    IReadOnlyDictionary<PaceZone, PaceRange> paces,
    Distance raceDistance)
{
    private const double WarmUpAndCoolDownKm = 3.5;

    private bool IsUltra => category is DistanceCategory.Ultra or DistanceCategory.LongUltra;

    private string GoalPaceLabel => IsUltra ? "race pace" : "goal pace";

    /// <param name="progress">0 at the start of a phase, 1 at its end; sessions get harder as it rises.</param>
    public PlannedSession Quality(DateOnly date, SessionType type, TrainingPhase phase, double progress) => type switch
    {
        SessionType.Hills => Hills(date, progress),
        SessionType.Fartlek => Fartlek(date, phase, progress),
        SessionType.Intervals => Intervals(date, phase, progress),
        SessionType.Tempo => Tempo(date, phase, progress),
        SessionType.CruiseIntervals => CruiseIntervals(date, progress),
        SessionType.ProgressionRun => ProgressionRun(date, progress),
        SessionType.RacePace => RacePace(date, progress),
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Not a quality session."),
    };

    public static PlannedSession Easy(DateOnly date, SessionType type, double km) => type switch
    {
        SessionType.Recovery => new(date, type, "Recovery run",
            "Very gentle running. Slower than feels necessary is about right.",
            "Gets blood into tired legs so you recover faster from yesterday's hard work.",
            Math.Min(km, 8), PaceZone.Recovery),
        SessionType.EasyWithStrides => new(date, type, "Easy run + strides",
            "Easy running, then 6 × 20 s strides: quick and relaxed, walk back between each.",
            "Keeps your legs quick without adding fatigue.",
            km, PaceZone.Easy),
        _ => new(date, SessionType.Easy, "Easy run",
            "Conversational effort. You should be able to talk in full sentences.",
            "Most of your fitness is built here, at very little cost.",
            km, PaceZone.Easy),
    };

    public PlannedSession Long(DateOnly date, SessionType type, double km)
    {
        var ultraNote = IsUltra ? " Walk the steep climbs as you plan to on race day, and eat something every 30 to 45 minutes." : "";
        switch (type)
        {
            case SessionType.LongRunFastFinish:
                var finish = Clamp(Round(km * 0.2), 2, 8);
                return new(date, type, "Fast-finish long run",
                    $"Run relaxed, then the last {Km(finish)} at {GoalPaceLabel}.{ultraNote}",
                    "Teaches you to hold pace on tired legs, which is how the end of a race feels.",
                    km, PaceZone.LongRun, SessionStructure.Continuous(finish, PaceZone.Race));
            case SessionType.LongRunRacePace:
                var middle = Clamp(Round(km * 0.35), 3, IsUltra ? 15 : 16);
                return new(date, type, "Race rehearsal long run",
                    $"Easy start, {Km(middle)} at {GoalPaceLabel} in the middle, easy to finish. Use your race-day food, drink and kit.{ultraNote}",
                    "A dress rehearsal: pace, fuelling and shoes all tested before race day.",
                    km, PaceZone.LongRun, SessionStructure.Continuous(middle, PaceZone.Race));
            default:
                return new(date, SessionType.LongRun, "Long run",
                    $"Steady and relaxed the whole way. Walk breaks are fine.{ultraNote}",
                    IsUltra ? "Time on your feet: the single most important session for an ultra." : "Builds the endurance that carries you to the finish.",
                    km, PaceZone.LongRun);
        }
    }

    public static PlannedSession MediumLong(DateOnly date, double km) => new(date, SessionType.MediumLongRun,
        "Back-to-back: medium-long run",
        "Steady running the day before your long run, so tomorrow starts on tired legs. Keep it truly easy.",
        "Builds the fatigue resistance an ultra needs without one enormous run.",
        km, PaceZone.LongRun);

    public static PlannedSession Strength(DateOnly date, TrainingPhase phase, bool isCutback)
    {
        // The detail is the short intro; the exercises themselves travel as a list, in the order to do them.
        var exercises = StrengthRoutine.For(phase, isCutback);
        return (phase, isCutback) switch
        {
            (TrainingPhase.Taper, _) or (_, true) => new(date, SessionType.Strength, "Mobility + light strength",
                "About 20 min. Start with hip, hamstring and ankle mobility, then work down the list. Keep it light.",
                "Keeps you supple and strong without adding fatigue in an easier week.",
                0, null, Exercises: exercises),
            (TrainingPhase.Base, _) => new(date, SessionType.Strength, "Strength & mobility",
                "About 30 min. Work down the list in order, resting about a minute between sets, then finish with 5 min of mobility.",
                "Stronger legs and hips hold your form late in a race and help keep injuries away.",
                0, null, Exercises: exercises),
            _ => new(date, SessionType.Strength, "Strength & mobility",
                "About 35 min. Work down the list in order, resting a minute between sets. Hold a weight once the last reps stop feeling hard.",
                "Single-leg strength and a little spring: running is a series of one-legged hops.",
                0, null, Exercises: exercises),
        };
    }

    public static PlannedSession Shakeout(DateOnly date, double km) => new(date, SessionType.Shakeout, "Shakeout + strides",
        "A short, easy jog with 4 × 20 s strides. Lay out your kit afterwards.",
        "Loosens the legs and settles the nerves before race day.",
        Clamp(km, 3, 5), PaceZone.Easy);

    public PlannedSession Sharpener(DateOnly date) => new(date, SessionType.RacePace, "Race-pace sharpener",
        $"Short warm-up, then 3 × 1 km at {GoalPaceLabel} with 2 min jog between. It should feel easy; stop there.",
        "Reminds your legs what race pace feels like without tiring them.",
        Round(2.5 + 3 * 1.25), PaceZone.Race, SessionStructure.Reps(3, 1000, PaceZone.Race));

    public PlannedSession RaceDay(DateOnly date) => new(date, SessionType.Race, "Race day",
        IsUltra
            ? $"{Km(raceDistance.Kilometres)}. Start slower than feels right, walk the climbs early, and eat before you're hungry."
            : $"{Km(raceDistance.Kilometres)}. Start at {GoalPaceLabel}, not faster, and save something for the second half.",
        "This is what every run in the plan was for. Enjoy it.",
        Math.Round(raceDistance.Kilometres, 1), PaceZone.Race);

    public double KmIn(PaceZone zone, TimeSpan duration) => paces[zone].Midpoint.KilometresIn(duration);

    private PlannedSession Hills(DateOnly date, double progress)
    {
        if (IsUltra)
        {
            var climbs = 5 + Steps(progress, 3);
            return new(date, SessionType.Hills, "Long hill repeats",
                $"Warm up, then {climbs} × 2–3 min uphill at a strong, steady effort. Run back down relaxed and quick-footed: your quads need the downhill practice as much as your lungs need the climb.",
                "Builds climbing strength and the downhill toughness that ultras demand.",
                Round(WarmUpAndCoolDownKm + climbs * 0.8), PaceZone.Interval, SessionStructure.ByEffort);
        }

        var reps = 6 + Steps(progress, 4);
        return new(date, SessionType.Hills, "Hill repeats",
            $"Warm up, then {reps} × 60 s uphill at a hard but controlled effort. Jog back down to recover.",
            "Builds strength and running form before the faster work starts.",
            Round(WarmUpAndCoolDownKm + reps * 0.35), PaceZone.Interval, SessionStructure.ByEffort);
    }

    private PlannedSession Fartlek(DateOnly date, TrainingPhase phase, double progress)
    {
        const string purpose = "Speed play: practise changing gears by feel, without the pressure of a track or a watch.";

        if (phase == TrainingPhase.Base || IsUltra)
        {
            var reps = 6 + Steps(progress, 4);
            var on = IsUltra ? 2 : 1;
            return new(date, SessionType.Fartlek, "Fartlek",
                $"Warm up, then {reps} × {on} min brisk / 1 min easy. Brisk means quicker than tempo, not a sprint.",
                purpose, Round(WarmUpAndCoolDownKm + KmIn(PaceZone.Tempo, TimeSpan.FromMinutes(reps * (on + 1)))), PaceZone.Interval, SessionStructure.ByEffort);
        }

        var sets = 2 + Steps(progress, 2);
        return new(date, SessionType.Fartlek, "Mixed fartlek",
            $"Warm up, then {sets} sets of 2 min hard, 1 min easy, 1 min hard, 1 min easy, 30 s fast, 90 s easy.",
            purpose, Round(WarmUpAndCoolDownKm + KmIn(PaceZone.Tempo, TimeSpan.FromMinutes(sets * 7))), PaceZone.Interval, SessionStructure.ByEffort);
    }

    private PlannedSession Intervals(DateOnly date, TrainingPhase phase, double progress)
    {
        const string purpose = "Raises your top-end fitness so that race pace feels easier.";
        var peak = phase == TrainingPhase.Peak;

        var (reps, metres, recovery, title) = category switch
        {
            DistanceCategory.FiveK when peak => (8 + Steps(progress, 4), 400, "60 s", "Speed intervals"),
            DistanceCategory.FiveK => (5 + Steps(progress, 3), 800, "90 s", "Intervals"),
            DistanceCategory.TenK when peak => (5 + Steps(progress, 3), 1000, "90 s", "10K intervals"),
            DistanceCategory.TenK => (4 + Steps(progress, 2), 1000, "2 min", "Intervals"),
            DistanceCategory.HalfMarathon => (4 + Steps(progress, 2), 1000, "2 min", "Intervals"),
            _ => (4 + Steps(progress, 2), 1200, "2 min", "Intervals"),
        };
        var where = peak && metres == 400 ? "the quick end of interval pace" : "interval pace";
        return new(date, SessionType.Intervals, title,
            $"Warm up, then {reps} × {metres} m at {where} with {recovery} jog between.",
            purpose, Round(WarmUpAndCoolDownKm + reps * (metres / 1000.0 + 0.3)), PaceZone.Interval, SessionStructure.Reps(reps, metres, PaceZone.Interval));
    }

    private PlannedSession Tempo(DateOnly date, TrainingPhase phase, double progress)
    {
        var minutes = category switch
        {
            DistanceCategory.FiveK or DistanceCategory.TenK => 15 + Steps(progress, 3) * 5,
            _ when phase == TrainingPhase.Peak => 25 + Steps(progress, 3) * 5,
            _ => 20 + Steps(progress, 3) * 5,
        };
        return new(date, SessionType.Tempo, "Tempo run",
            $"Warm up, then {minutes} min continuous at tempo pace: comfortably hard, a few words at a time.",
            "Lifts your threshold, the fastest pace you can hold before fatigue builds quickly.",
            Round(WarmUpAndCoolDownKm + KmIn(PaceZone.Tempo, TimeSpan.FromMinutes(minutes))), PaceZone.Tempo,
            SessionStructure.Continuous(KmIn(PaceZone.Tempo, TimeSpan.FromMinutes(minutes)), PaceZone.Tempo));
    }

    private PlannedSession CruiseIntervals(DateOnly date, double progress)
    {
        var reps = 3 + Steps(progress, 2);
        var repKm = category is DistanceCategory.HalfMarathon ? 1.6 : 2;
        return new(date, SessionType.CruiseIntervals, "Cruise intervals",
            $"Warm up, then {reps} × {Km(repKm)} at tempo pace with 60 s jog between.",
            "Threshold work in chunks, so you can do more of it at exactly the right pace.",
            Round(WarmUpAndCoolDownKm + reps * (repKm + 0.2)), PaceZone.Tempo, SessionStructure.Reps(reps, repKm * 1000, PaceZone.Tempo));
    }

    private PlannedSession ProgressionRun(DateOnly date, double progress)
    {
        var minutes = (IsUltra ? 50 : 35) + Steps(progress, 3) * 5;
        var fastMinutes = minutes / 3;
        var km = KmIn(PaceZone.Easy, TimeSpan.FromMinutes(minutes - fastMinutes)) + KmIn(PaceZone.Tempo, TimeSpan.FromMinutes(fastMinutes));
        return new(date, SessionType.ProgressionRun, "Progression run",
            $"{minutes} min that start at easy pace and get steadily quicker, with the last {fastMinutes} min at tempo pace.",
            "Teaches you to finish strong, and builds threshold fitness more gently than a full tempo run.",
            Round(km), PaceZone.Tempo,
            SessionStructure.Continuous(KmIn(PaceZone.Tempo, TimeSpan.FromMinutes(fastMinutes)), PaceZone.Tempo));
    }

    private PlannedSession RacePace(DateOnly date, double progress)
    {
        const string purpose = "Rehearses your goal pace until it feels familiar.";
        var (detail, workKm, structure) = category switch
        {
            DistanceCategory.FiveK => Reps(3 + Steps(progress, 2), 1, "2 min"),
            DistanceCategory.TenK => Reps(3 + Steps(progress, 2), 2, "2 min"),
            DistanceCategory.HalfMarathon => Reps(2, 3 + Steps(progress, 2), "3 min"),
            DistanceCategory.Marathon => Continuous(6 + Steps(progress, 6)),
            DistanceCategory.Ultra => Continuous(8 + Steps(progress, 6)),
            _ => Continuous(10 + Steps(progress, 6)),
        };
        return new(date, SessionType.RacePace, $"{Capitalise(GoalPaceLabel)} run",
            $"Warm up, then {detail}.", purpose, Round(WarmUpAndCoolDownKm + workKm), PaceZone.Race, structure);

        (string, double, SessionStructure) Reps(int count, double km, string recovery) =>
            ($"{count} × {Km(km)} at {GoalPaceLabel} with {recovery} jog between", count * (km + 0.25), SessionStructure.Reps(count, km * 1000, PaceZone.Race));

        (string, double, SessionStructure) Continuous(double km) =>
            ($"{Km(km)} continuous at {GoalPaceLabel}", km, SessionStructure.Continuous(km, PaceZone.Race));
    }

    private static int Steps(double progress, int maxSteps) => (int)Math.Round(Math.Clamp(progress, 0, 1) * maxSteps);

    internal static double Round(double km) => Math.Round(km * 2, MidpointRounding.AwayFromZero) / 2;

    private static double Clamp(double value, double min, double max) => Math.Min(Math.Max(value, min), max);

    private static string Km(double km) => $"{Math.Round(km, 1).ToString("0.#", CultureInfo.InvariantCulture)} km";

    private static string Capitalise(string text) => string.Concat(text[..1].ToUpperInvariant(), text[1..]);
}
