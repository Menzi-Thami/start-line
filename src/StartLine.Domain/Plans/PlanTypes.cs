using StartLine.Domain.Coaching;
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

/// <param name="Steps">
/// How to run it, step by step (warm-up, the work and its recoveries, cool-down), each with its pace for that week. Built
/// from the same numbers as <see cref="Detail"/>, which stays as the summary.
/// </param>
/// <param name="RunWalk">
/// Run/walk from the start, at this ratio: set on long runs, the ultra medium-long run and race day when the plan uses
/// run/walk (<see cref="RunWalkRules"/>). Null for every other session, and for every plan before version 3.
/// </param>
public sealed record PlannedSession(
    DateOnly Date,
    SessionType Type,
    string Title,
    string Detail,
    string Purpose,
    double DistanceKm,
    PaceZone? Zone,
    SessionStructure? Structure = null,
    IReadOnlyList<StrengthExercise>? Exercises = null,
    SessionSteps? Steps = null,
    RunWalkRatio? RunWalk = null)
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

/// <param name="GeneratorVersion">
/// Which shape of plan to build: 1 for plans made before the per-distance shapes, 2 since. A plan keeps the version it
/// was first built with, so a shared link or a saved plan never changes shape part-way through.
/// </param>
/// <param name="StartOn">
/// The day the runner wants to start, from <see cref="Today"/> to two weeks before the race. Null: the first Monday on or
/// after <see cref="Today"/>, as every plan before this. Weeks still run Monday to Sunday, so a start mid-week makes a
/// shorter first week with only the runs from that day on.
/// </param>
/// <param name="RunWalk">
/// Run/walk on the long runs and race day: Auto (decided from the goal), On or Off. Version 3 plans and later only;
/// older versions ignore it, so their plans never change.
/// </param>
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
    PlanReplan? Replan = null,
    IReadOnlyList<CoachDecision>? Coaching = null,
    int GeneratorVersion = TrainingPlanGenerator.OriginalVersion,
    DateOnly? StartOn = null,
    RunWalkMode RunWalk = RunWalkMode.Auto)
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
