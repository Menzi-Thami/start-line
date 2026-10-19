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
    IReadOnlyList<PlannedSession> Sessions)
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
    IReadOnlyList<PlanWarning> Warnings);

public sealed record PlanParameters(
    Distance RaceDistance,
    TimeSpan GoalTime,
    DateOnly RaceDate,
    DateOnly Today,
    IReadOnlyCollection<DayOfWeek> RunDays,
    DayOfWeek LongRunDay,
    double? CurrentWeeklyKm,
    Experience Experience = Experience.Regular,
    IReadOnlyCollection<DayOfWeek>? StrengthDays = null)
{
    public int RunsPerWeek => RunDays.Where(Enum.IsDefined).Distinct().Count();
}
