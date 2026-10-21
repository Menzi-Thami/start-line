using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public enum DistanceCategory
{
    FiveK,
    TenK,
    HalfMarathon,
    Marathon,

    /// <summary>Up to 60 km, such as Two Oceans.</summary>
    Ultra,

    /// <summary>Over 60 km, such as Comrades.</summary>
    LongUltra,
}

public enum TrainingPhase
{
    Base,
    Build,
    Peak,
    Taper,
    RaceWeek,
}

public enum SessionType
{
    Easy,
    Recovery,
    EasyWithStrides,
    Hills,
    Fartlek,
    Intervals,
    Tempo,
    CruiseIntervals,
    ProgressionRun,
    RacePace,
    MediumLongRun,
    LongRun,
    LongRunFastFinish,
    LongRunRacePace,
    Shakeout,
    Race,
    Strength,
}

public enum Experience
{
    /// <summary>Running for less than a year, or coming back after a long break.</summary>
    New,
    Regular,

    /// <summary>Several years of consistent training and a few races of this distance.</summary>
    Experienced,
}

public sealed record PlannedSession(
    DateOnly Date,
    SessionType Type,
    string Title,
    string Detail,
    string Purpose,
    double DistanceKm,
    PaceZone? Zone,
    SessionStructure? Structure = null,
    IReadOnlyList<StrengthExercise>? Exercises = null)
{
    /// <summary>How the session is built. Without one, the whole run is meant to sit in <see cref="Zone"/>.</summary>
    public SessionStructure Shape => Structure ?? SessionStructure.Steady;
}

public sealed record PlanWeek(
    int Number,
    DateOnly StartDate,
    TrainingPhase Phase,
    bool IsCutback,
    IReadOnlyList<PlannedSession> Sessions,
    bool IsReplanned = false)
{
    public double PlannedKm => Math.Round(Sessions.Sum(s => s.DistanceKm), 1);
}

public sealed record PlanWarning(string Code, string Message);

public sealed record TrainingPlan(
    Distance RaceDistance,
    DistanceCategory Category,
    DateOnly RaceDate,
    TimeSpan GoalTime,
    DateOnly StartDate,
    IReadOnlyDictionary<PaceZone, PaceRange> Paces,
    IReadOnlyList<PlanWeek> Weeks,
    IReadOnlyList<PlanWarning> Warnings,
    PlanReplan? Replan = null,
    TimeSpan? SuggestedGoal = null);

public sealed record PlanParameters(
    Distance RaceDistance,
    TimeSpan GoalTime,
    DateOnly RaceDate,
    DateOnly Today,
    IReadOnlyCollection<DayOfWeek> RunDays,
    DayOfWeek LongRunDay,
    double? CurrentWeeklyKm,
    Experience Experience = Experience.Regular,
    IReadOnlyCollection<DayOfWeek>? StrengthDays = null,
    PlanReplan? Replan = null)
{
    public int RunsPerWeek => RunDays.Where(Enum.IsDefined).Distinct().Count();
}

/// <summary>Why a runner is rebuilding the rest of their plan.</summary>
public enum Setback
{
    /// <summary>A healthy break: a holiday, work, life. Up to about two weeks.</summary>
    MissedTraining,
    Illness,
    Injury,

    /// <summary>Still running, just less than the plan asked for.</summary>
    Behind,
}

/// <summary>
/// "Replan from here": the plan up to <see cref="From"/> stays as it was, and the weeks after it are rebuilt from a
/// volume the runner can manage now. <see cref="RecentWeeklyKm"/> is what they ran last week, if they said.
/// </summary>
public sealed record PlanReplan(DateOnly From, Setback Setback, double? RecentWeeklyKm = null);
