using StartLine.Domain.Common;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Coaching;

public enum CheckInStatus
{
    Done,

    /// <summary>Started, but stopped short of the planned distance or work.</summary>
    CutShort,

    /// <summary>Ran, but easy instead of the session planned.</summary>
    SwappedForEasy,
    Skipped,
}

public enum PainLevel
{
    None,

    /// <summary>Noticed something, but it didn't change the run.</summary>
    Niggle,

    /// <summary>It hurt enough to change how they ran, or to stop.</summary>
    ChangedRunning,
}

public enum BodyArea
{
    Foot,
    Ankle,
    Achilles,
    Calf,
    Shin,
    Knee,
    Hamstring,
    Quad,
    Hip,
    Glute,
    LowerBack,
    Other,
}

/// <summary>
/// What the runner said about one session: did they run it and how did it feel. Effort is the runner's own 1–10 scale
/// (1 barely moving, 10 all out). The distance and time are for runs no watch or app recorded.
/// </summary>
public sealed record CheckInAnswers(
    CheckInStatus Status,
    int? Effort,
    PainLevel Pain = PainLevel.None,
    BodyArea? PainArea = null,
    double? DistanceKm = null,
    TimeSpan? Duration = null,
    string? Note = null);

/// <summary>
/// The runner's check-in on one planned run, the coach's main way of knowing how training is landing. A session is
/// a date and a type within a saved plan, so a check-in survives the plan being regenerated; one per session.
/// </summary>
public sealed class SessionCheckIn
{
    public const int MinEffort = 1;
    public const int MaxEffort = 10;
    public const int MaxNoteLength = 280;
    public const double MaxDistanceKm = 300;
    public static readonly TimeSpan MaxDuration = TimeSpan.FromHours(30);

    private SessionCheckIn()
    {
    }

    public Guid Id { get; private set; }

    public Guid SavedPlanId { get; private set; }

    public DateOnly Date { get; private set; }

    public SessionType SessionType { get; private set; }

    public CheckInStatus Status { get; private set; }

    public int? Effort { get; private set; }

    public PainLevel Pain { get; private set; }

    public BodyArea? PainArea { get; private set; }

    public double? DistanceKm { get; private set; }

    public TimeSpan? Duration { get; private set; }

    public string? Note { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Whether a session can be checked in on at all: runs can, strength and the race itself can't.</summary>
    public static bool IsCheckable(SessionType type) => type is not (SessionType.Strength or SessionType.Race);

    public static SessionCheckIn Create(Guid savedPlanId, DateOnly date, SessionType sessionType, CheckInAnswers answers)
    {
        if (savedPlanId == Guid.Empty)
        {
            throw new DomainException("A check-in belongs to a saved plan.");
        }

        if (!Enum.IsDefined(sessionType) || !IsCheckable(sessionType))
        {
            throw new DomainException("Only runs can be checked in on.");
        }

        var checkIn = new SessionCheckIn { Id = Guid.NewGuid(), SavedPlanId = savedPlanId, Date = date, SessionType = sessionType };
        checkIn.Answer(answers);
        return checkIn;
    }

    /// <summary>Replaces the answers: the runner changed their mind, or added the distance later.</summary>
    public void Answer(CheckInAnswers answers)
    {
        ArgumentNullException.ThrowIfNull(answers);
        if (!Enum.IsDefined(answers.Status) || !Enum.IsDefined(answers.Pain) || (answers.PainArea is { } area && !Enum.IsDefined(area)))
        {
            throw new DomainException("Unknown answer in the check-in.");
        }

        var skipped = answers.Status == CheckInStatus.Skipped;
        if (skipped ? answers.Effort is not null : answers.Effort is not (>= MinEffort and <= MaxEffort))
        {
            throw new DomainException(skipped
                ? "A skipped run has no effort to rate."
                : $"Rate the effort from {MinEffort} (very easy) to {MaxEffort} (all out).");
        }

        if (skipped && (answers.DistanceKm is not null || answers.Duration is not null))
        {
            throw new DomainException("A skipped run has no distance or time.");
        }

        if (answers.DistanceKm is <= 0 or > MaxDistanceKm)
        {
            throw new DomainException($"The distance must be more than 0 and at most {MaxDistanceKm} km.");
        }

        if (answers.Duration is { } duration && (duration <= TimeSpan.Zero || duration > MaxDuration))
        {
            throw new DomainException("The time must be more than zero and under 30 hours.");
        }

        if (answers.Pain == PainLevel.None && answers.PainArea is not null)
        {
            throw new DomainException("Say where it hurt only if something hurt.");
        }

        var note = string.IsNullOrWhiteSpace(answers.Note) ? null : answers.Note.Trim();
        if (note?.Length > MaxNoteLength)
        {
            throw new DomainException($"Keep the note to {MaxNoteLength} characters.");
        }

        Status = answers.Status;
        Effort = answers.Effort;
        Pain = answers.Pain;
        PainArea = answers.PainArea;
        DistanceKm = answers.DistanceKm;
        Duration = answers.Duration;
        Note = note;
    }
}
