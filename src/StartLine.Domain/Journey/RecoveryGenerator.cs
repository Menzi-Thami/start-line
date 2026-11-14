namespace StartLine.Domain.Journey;

/// <summary>Everything a recovery schedule is built from. Dates are the runner's local dates.</summary>
public sealed record RecoveryInputs(
    double DistanceKm,
    DateOnly RaceDate,
    RecoveryEffort Effort,
    RecoveryPreference Preference,
    IReadOnlyList<DayOfWeek> RunDays,
    int ExtraDays,
    IReadOnlyList<RecoveryPause> Pauses,
    IReadOnlyList<RecoveryCheckIn> CheckIns);

/// <summary>
/// One recovery day. <see cref="DayNumber"/> is days since the race (race day is 0). <see cref="Gated"/> marks a day still
/// to come that is scheduled for easy return but held back until the runner checks in "Good to go".
/// </summary>
public sealed record RecoveryDay(
    DateOnly Date,
    int DayNumber,
    RecoveryPhase Phase,
    RecoveryDayKind Kind,
    string Title,
    string Guidance,
    int? MinMinutes,
    int? MaxMinutes,
    bool Optional,
    bool Gated);

/// <summary>A recovery schedule as of one local day, with where the runner is in it today.</summary>
public sealed record RecoverySchedule(
    RecoveryCategory Category,
    string Framing,
    int RestDays,
    int GentleDays,
    int EasyReturnDays,
    IReadOnlyList<RecoveryDay> Days,
    DateOnly EndsOn,
    int DayNumber,
    RecoveryPhase Phase,
    RecoveryReadinessState Readiness,
    bool SeekCare,
    string? SafetyMessage,
    bool CanComplete);

/// <summary>
/// Post-race recovery, version 1. Pure: the same inputs and "today" always give the same days. Recovery restores
/// readiness; it is not training. Every day but race day is optional, nothing is ever paced, no intervals, tempo, long
/// runs or tests, and no day holds more than <see cref="MaxMinutes"/> minutes. Each day's phase is the lower of its
/// scheduled phase and the ceiling the latest check-in on or before it allows, so a runner never progresses without
/// saying they're ready, and any pain or warning sign stops all exercise until a later check-in says otherwise.
/// </summary>
public static class RecoveryGenerator
{
    public const int Version = 1;

    /// <summary>The most any recovery day ever asks for.</summary>
    public const int MaxMinutes = 45;

    /// <summary>How many minutes each easy run in the easy return allows, in order. It stays at the last step.</summary>
    private static readonly (int Min, int Max)[] EasyRunLadder = [(15, 20), (15, 25), (20, 30), (25, 35), (30, 40), (30, 45)];

    public static RecoveryCategory CategoryOf(double distanceKm) => distanceKm switch
    {
        <= 6 => RecoveryCategory.FiveK,
        <= 12 => RecoveryCategory.TenK,
        <= 25 => RecoveryCategory.Half,
        <= 45 => RecoveryCategory.Marathon,
        <= 60 => RecoveryCategory.Ultra,
        _ => RecoveryCategory.LongUltra,
    };

    /// <summary>The orientation shown to the runner: a range for healthy runners, never a promise of a safe return.</summary>
    public static string FramingOf(RecoveryCategory category) => category switch
    {
        RecoveryCategory.FiveK => "about 2–4 days",
        RecoveryCategory.TenK => "about 3–7 days",
        RecoveryCategory.Half => "about 7–14 days",
        RecoveryCategory.Marathon => "about 2–4 weeks",
        _ => "several weeks, individual",
    };

    /// <summary>Days of rest, gentle movement and easy return after race day, scaled by effort (at least one each).</summary>
    public static (int RestDays, int GentleDays, int EasyReturnDays) PhaseDays(RecoveryCategory category, RecoveryEffort effort, int extraDays = 0)
    {
        var (rest, gentle, easy) = category switch
        {
            RecoveryCategory.FiveK => (1, 1, 1),
            RecoveryCategory.TenK => (1, 2, 2),
            RecoveryCategory.Half => (2, 3, 5),
            RecoveryCategory.Marathon => (3, 6, 12),
            RecoveryCategory.Ultra => (5, 9, 14),
            _ => (7, 11, 17),
        };
        var factor = effort switch
        {
            RecoveryEffort.Easy => 0.75,
            RecoveryEffort.AllOut => 1.25,
            _ => 1.0,
        };
        return (Scale(rest, factor), Scale(gentle, factor), Scale(easy, factor) + Math.Max(0, extraDays));
    }

    /// <summary>
    /// How many easy runs a week the easy return offers: up to half the runner's run days, two or three a week (fewer only
    /// when the runner runs on fewer days).
    /// </summary>
    public static int EasyRunsPerWeek(int runDays) => runDays <= 1 ? Math.Max(runDays, 0) : Math.Min(runDays, Math.Clamp((runDays + 1) / 2, 2, 3));

    public static RecoverySchedule Build(RecoveryInputs inputs, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(inputs);
        var category = CategoryOf(inputs.DistanceKm);
        var (rest, gentle, easy) = PhaseDays(category, inputs.Effort, inputs.ExtraDays);
        var total = rest + gentle + easy;
        var checkIns = inputs.CheckIns.Where(c => c.Date >= inputs.RaceDate).OrderBy(c => c.Date).ToList();
        var ordered = JourneyDays.Ordered(inputs.RunDays);
        var runDays = JourneyDays.Spread(ordered.Count == 0 ? JourneyDays.Default : ordered,
            EasyRunsPerWeek(ordered.Count == 0 ? JourneyDays.Default.Count : ordered.Count)).ToHashSet();

        List<RecoveryDay> days = [new(inputs.RaceDate, 0, RecoveryPhase.RaceDay, RecoveryDayKind.RaceDay, "Race day",
            "Celebrate. Eat, drink and rest: there is nothing else to do today.", null, null, Optional: false, Gated: false)];
        var clock = 0;
        var easyRuns = 0;
        for (var date = inputs.RaceDate.AddDays(1); clock < total; date = date.AddDays(1))
        {
            var number = date.DayNumber - inputs.RaceDate.DayNumber;
            if (IsPaused(inputs.Pauses, date, today))
            {
                easyRuns = 0;
                days.Add(new(date, number, RecoveryPhase.Paused, RecoveryDayKind.Paused, "Recovery paused",
                    "Your recovery is paused, so nothing is planned for this day.", null, null, Optional: true, Gated: false));
                continue;
            }

            clock++;
            var scheduled = clock <= rest ? RecoveryPhase.Rest : clock <= rest + gentle ? RecoveryPhase.Gentle : RecoveryPhase.EasyReturn;
            var latest = checkIns.LastOrDefault(c => c.Date <= date);
            var phase = Lower(scheduled, CeilingOf(latest));
            if (phase != RecoveryPhase.EasyReturn)
            {
                easyRuns = 0;
            }

            var gated = date > today && scheduled == RecoveryPhase.EasyReturn && phase != RecoveryPhase.EasyReturn;
            days.Add(Day(date, number, clock, phase, inputs.Preference, runDays, ref easyRuns, gated));
        }

        var endsOn = days[^1].Date;
        var current = checkIns.LastOrDefault(c => c.Date <= today);
        var seekCare = current?.NeedsCare == true;
        var dayNumber = Math.Max(0, today.DayNumber - inputs.RaceDate.DayNumber);
        var phaseToday = days.FirstOrDefault(d => d.Date == today)?.Phase
            ?? (today < inputs.RaceDate ? RecoveryPhase.RaceDay
                : IsPaused(inputs.Pauses, today, today) ? RecoveryPhase.Paused
                : Lower(RecoveryPhase.EasyReturn, CeilingOf(current)));
        return new RecoverySchedule(
            category, FramingOf(category), rest, gentle, easy, days, endsOn, dayNumber, phaseToday,
            ReadinessOf(current),
            seekCare, seekCare ? SafetyMessageFor(current!) : null,
            current is { Feeling: RecoveryFeeling.GoodToGo, NeedsCare: false });
    }

    /// <summary>The most a check-in allows: none or unsure keeps to gentle movement; only "Good to go" opens easy running.</summary>
    public static RecoveryPhase CeilingOf(RecoveryCheckIn? checkIn) => checkIn switch
    {
        null => RecoveryPhase.Gentle,
        { NeedsCare: true } => RecoveryPhase.SeekCare,
        { Feeling: RecoveryFeeling.GoodToGo } => RecoveryPhase.EasyReturn,
        { Feeling: RecoveryFeeling.VeryFatigued } => RecoveryPhase.Rest,
        _ => RecoveryPhase.Gentle,
    };

    public static RecoveryReadinessState ReadinessOf(RecoveryCheckIn? checkIn) => checkIn?.Feeling switch
    {
        null => RecoveryReadinessState.NotCheckedIn,
        RecoveryFeeling.GoodToGo => RecoveryReadinessState.GoodToGo,
        RecoveryFeeling.StillSore => RecoveryReadinessState.StillSore,
        RecoveryFeeling.VeryFatigued => RecoveryReadinessState.VeryFatigued,
        RecoveryFeeling.PainOrInjury => RecoveryReadinessState.PainOrInjury,
        _ => RecoveryReadinessState.NotSure,
    };

    private static int Scale(int days, double factor) => Math.Max(1, (int)Math.Round(days * factor, MidpointRounding.AwayFromZero));

    private static int Rank(RecoveryPhase phase) => phase switch
    {
        RecoveryPhase.SeekCare => 0,
        RecoveryPhase.Rest => 1,
        RecoveryPhase.Gentle => 2,
        _ => 3,
    };

    private static RecoveryPhase Lower(RecoveryPhase a, RecoveryPhase b) => Rank(a) <= Rank(b) ? a : b;

    /// <summary>Paused days run from a pause's first day up to (not including) the day it was resumed; an open pause covers up to today.</summary>
    private static bool IsPaused(IReadOnlyList<RecoveryPause> pauses, DateOnly date, DateOnly today) =>
        pauses.Any(p => p.From <= date && (p.To is { } to ? date < to : date <= today));

    private static RecoveryDay Day(DateOnly date, int number, int clock, RecoveryPhase phase, RecoveryPreference preference, HashSet<DayOfWeek> runDays, ref int easyRuns, bool gated)
    {
        var activityDay = clock % 2 == 0;
        switch (phase)
        {
            case RecoveryPhase.SeekCare:
                return new(date, number, phase, RecoveryDayKind.SeekCare, "Get checked first",
                    "You told us about pain or a warning sign. Please don't exercise: see a doctor or physio, and check in again once you've been seen or it has settled.",
                    null, null, Optional: false, gated);
            case RecoveryPhase.Rest when activityDay && preference != RecoveryPreference.Rest:
                return new(date, number, phase, RecoveryDayKind.Walk, "Optional short walk",
                    "A relaxed 10–20 minute walk if you feel like it. Resting instead is just as good.", 10, 20, Optional: true, gated);
            case RecoveryPhase.Rest:
                return Rest(date, number, phase, gated);
            case RecoveryPhase.Gentle when activityDay:
                return preference switch
                {
                    RecoveryPreference.Rest => new(date, number, phase, RecoveryDayKind.Mobility, "Gentle mobility",
                        "10–15 minutes of easy stretching and mobility. Stop if anything hurts.", 10, 15, Optional: true, gated),
                    RecoveryPreference.CrossTraining => new(date, number, phase, RecoveryDayKind.CrossTraining, "Very light cross-training",
                        "20–30 minutes of very easy cycling, swimming or elliptical, light enough to chat the whole way.", 20, 30, Optional: true, gated),
                    _ => new(date, number, phase, RecoveryDayKind.Walk, "Easy walk",
                        "A 20–30 minute walk at an easy, comfortable pace.", 20, 30, Optional: true, gated),
                };
            case RecoveryPhase.Gentle:
                return Rest(date, number, phase, gated);
            default:
                if (!runDays.Contains(date.DayOfWeek))
                {
                    return Rest(date, number, phase, gated);
                }

                var (min, max) = EasyRunLadder[Math.Min(easyRuns, EasyRunLadder.Length - 1)];
                easyRuns++;
                return new(date, number, phase, RecoveryDayKind.EasyRun, "Easy run",
                    $"If you feel like it, a short, easy run of {min}–{max} minutes at a pace you could chat at. Walk breaks are fine, there's no pace or distance to hit, and stop if anything hurts.",
                    min, max, Optional: true, gated);
        }
    }

    private static RecoveryDay Rest(DateOnly date, int number, RecoveryPhase phase, bool gated) =>
        new(date, number, phase, RecoveryDayKind.Rest, "Rest", "Rest is part of recovery. Eat well, drink and sleep.", null, null, Optional: true, gated);

    private static string SafetyMessageFor(RecoveryCheckIn checkIn) =>
        checkIn.RedFlags.Any(f => f is RecoveryRedFlag.ChestPain or RecoveryRedFlag.Fainting or RecoveryRedFlag.DarkUrine)
            ? "Chest pain, fainting or dark urine after a race can be serious. Get urgent medical help now, and don't exercise."
            : "Please get checked by a doctor or physio before you exercise again. Your recovery waits until you're ready.";
}
