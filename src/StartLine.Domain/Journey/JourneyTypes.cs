namespace StartLine.Domain.Journey;

/// <summary>How the race went, in the runner's own words. Only <see cref="Finished"/> earns a finisher badge.</summary>
public enum RaceOutcome
{
    Finished,
    DidNotStart,
    DidNotFinish,
}

public enum AchievementKind
{
    /// <summary>Every training run of the plan confirmed as done by the runner (the race itself not included).</summary>
    TrainingComplete,

    /// <summary>The runner recorded that they finished the race.</summary>
    RaceFinished,
}

/// <summary>Where a plan is in the runner's journey: training, the finish line, the race, recovery, or the past.</summary>
public enum JourneyLifecycle
{
    Active,

    /// <summary>Every training run confirmed; the race is still to come (or today).</summary>
    TrainingComplete,

    /// <summary>Training is over or the race day has passed, and no result is recorded yet. Never an assumed finish.</summary>
    RacePending,
    RaceCompleted,

    /// <summary>The runner said they didn't start or didn't finish.</summary>
    RaceNotCompleted,
    Recovering,
    Recovered,

    /// <summary>A past plan with no race result or recovery: kept as history.</summary>
    Archived,

    /// <summary>The training plan has ended after race day. Race confirmation and recovery have separate lifecycles.</summary>
    Concluded,
}

/// <summary>A recovery's distance band. Decides how long each phase lasts.</summary>
public enum RecoveryCategory
{
    FiveK,
    TenK,
    Half,
    Marathon,
    Ultra,
    LongUltra,
}

/// <summary>How hard the runner says the race was. Scales every recovery phase.</summary>
public enum RecoveryEffort
{
    Easy,
    Hard,
    AllOut,
}

/// <summary>What the runner would rather do while recovering. Every activity stays optional whatever they choose.</summary>
public enum RecoveryPreference
{
    Rest,
    Walk,
    CrossTraining,
    EasyRunning,
}

/// <summary>A recovery check-in: how the runner feels. Nothing progresses without "Good to go".</summary>
public enum RecoveryFeeling
{
    GoodToGo,
    StillSore,
    VeryFatigued,
    PainOrInjury,
    NotSure,
}

/// <summary>Warning signs. Any one of them means "get checked": no exercise is suggested over them.</summary>
#pragma warning disable CA1711 // "Red flag" is the medical term the API contract and the client use; it isn't a [Flags] enum.
public enum RecoveryRedFlag
#pragma warning restore CA1711
{
    SeverePain,
    CannotWalkNormally,
    MarkedSwelling,
    DarkUrine,
    Fainting,
    ChestPain,
}

/// <summary>The runner's latest recovery check-in, or none yet.</summary>
public enum RecoveryReadinessState
{
    NotCheckedIn,
    GoodToGo,
    StillSore,
    VeryFatigued,
    PainOrInjury,
    NotSure,
}

public enum RecoveryStatus
{
    Active,
    Paused,

    /// <summary>The runner said they were good to go and finished recovery.</summary>
    Completed,

    /// <summary>The runner stopped the recovery early. Nothing is lost; it can be restarted.</summary>
    Ended,
}

/// <summary>
/// A recovery day's phase. For the readiness gate, the load order is SeekCare (none) &lt; Rest &lt; Gentle &lt; EasyReturn
/// (<see cref="RecoveryGenerator"/>), whatever the order here.
/// </summary>
public enum RecoveryPhase
{
    RaceDay,
    Rest,
    Gentle,
    EasyReturn,
    SeekCare,
    Paused,
}

/// <summary>What a recovery day holds. Never pace, intervals, tempo, long runs or tests.</summary>
public enum RecoveryDayKind
{
    RaceDay,
    Rest,
    Walk,
    Mobility,
    CrossTraining,
    EasyRun,
    SeekCare,
    Paused,
}

public enum MaintenanceStatus
{
    Active,
    Ended,
}

public enum MaintenanceSessionKind
{
    EasyRun,
    LongerEasyRun,
    Strength,
}

/// <summary>A recovery check-in on one local date. One per date; a later answer the same day replaces it.</summary>
public sealed record RecoveryCheckIn(DateOnly Date, RecoveryFeeling Feeling, IReadOnlyList<RecoveryRedFlag> RedFlags, string? Note)
{
    /// <summary>Pain, or any warning sign: no exercise until a later check-in says otherwise.</summary>
    public bool NeedsCare => Feeling == RecoveryFeeling.PainOrInjury || RedFlags.Count > 0;
}

/// <summary>A pause: from the day it started until the day the runner resumed (null while still paused). The resume day is active.</summary>
public sealed record RecoveryPause(DateOnly From, DateOnly? To);

internal static class JourneyDays
{
    /// <summary>The default days for a runner who hasn't chosen any: Tuesday, Thursday, Saturday and Sunday.</summary>
    public static readonly IReadOnlyList<DayOfWeek> Default = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    /// <summary>Monday first, as the plan's weeks run.</summary>
    public static int MondayIndex(DayOfWeek day) => ((int)day + 6) % 7;

    public static DateOnly MondayOf(DateOnly date) => date.AddDays(-MondayIndex(date.DayOfWeek));

    public static IReadOnlyList<DayOfWeek> Ordered(IEnumerable<DayOfWeek>? days) =>
        [.. (days ?? []).Where(Enum.IsDefined).Distinct().OrderBy(MondayIndex)];

    /// <summary>
    /// <paramref name="count"/> of the chosen days, spread out: every other day first (so runs are never back to back when
    /// the days allow it), then the ones in between.
    /// </summary>
    public static IReadOnlyList<DayOfWeek> Spread(IReadOnlyList<DayOfWeek> ordered, int count)
    {
        var picked = ordered.Where((_, i) => i % 2 == 0).Take(count).ToList();
        picked.AddRange(ordered.Where((_, i) => i % 2 == 1).Take(count - picked.Count));
        return [.. picked.OrderBy(MondayIndex)];
    }
}
