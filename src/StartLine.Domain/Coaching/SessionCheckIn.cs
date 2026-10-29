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
/// (1 barely moving, 10 all out); a plain tick ("done", nothing more) leaves it out. Manual distance and time are independent entries;
/// imported runs are linked without copying their cached metrics.
/// </summary>
public sealed record CheckInAnswers(
    CheckInStatus Status,
    int? Effort,
    PainLevel Pain = PainLevel.None,
    BodyArea? PainArea = null,
    double? DistanceKm = null,
    TimeSpan? Duration = null,
    string? Note = null,
    SessionType? ActualSessionType = null,
    bool DistanceUnreported = false,
    Guid? ActivityId = null);

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

    public SessionType? ActualSessionType { get; private set; }

    public bool DistanceUnreported { get; private set; }

    /// <summary>A link only; imported metrics are never copied into a permanent check-in.</summary>
    public Guid? ActivityId { get; private set; }

    public bool IsAdditional { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public CheckInAnswers Answers => new(Status, Effort, Pain, PainArea, DistanceKm, Duration, Note, ActualSessionType, DistanceUnreported, ActivityId);

    /// <summary>
    /// A run that happened is rated 1–10. "Done" on its own is a tick: the runner says they ran it and nothing more, so it
    /// may come without an effort until they add one. A run cut short or swapped for an easy one always says how it felt.
    /// </summary>
    public static bool EffortIsValid(CheckInStatus status, int? effort) =>
        effort is (>= MinEffort and <= MaxEffort) || (effort is null && status == CheckInStatus.Done);

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

    public static SessionCheckIn CreateAdditional(Guid id, Guid savedPlanId, DateOnly date, SessionType type, CheckInAnswers answers)
    {
        ArgumentNullException.ThrowIfNull(answers);
        if (id == Guid.Empty || answers.Status == CheckInStatus.Skipped)
        {
            throw new DomainException("An additional run needs an id and must have happened.");
        }

        var entry = Create(savedPlanId, date, type, answers);
        entry.Id = id;
        entry.IsAdditional = true;
        return entry;
    }

    /// <summary>Replaces the answers: the runner changed their mind, or added the distance later.</summary>
    public void Answer(CheckInAnswers answers)
    {
        ArgumentNullException.ThrowIfNull(answers);
        if (!Enum.IsDefined(answers.Status) || !Enum.IsDefined(answers.Pain) || (answers.PainArea is { } area && !Enum.IsDefined(area)))
        {
            throw new DomainException("Unknown answer in the check-in.");
        }

        if (answers.ActualSessionType is { } actual && (!Enum.IsDefined(actual) || !IsCheckable(actual)))
        {
            throw new DomainException("Choose a running workout type.");
        }

        if (answers.DistanceUnreported && answers.DistanceKm is not null)
        {
            throw new DomainException("An unknown distance cannot also have a distance.");
        }

        var skipped = answers.Status == CheckInStatus.Skipped;
        if (skipped ? answers.Effort is not null : !EffortIsValid(answers.Status, answers.Effort))
        {
            throw new DomainException(skipped
                ? "A skipped run has no effort to rate."
                : $"Rate the effort from {MinEffort} (very easy) to {MaxEffort} (all out).");
        }

        if (skipped && (answers.DistanceKm is not null || answers.Duration is not null || answers.ActivityId is not null || answers.ActualSessionType is not null))
        {
            throw new DomainException("A skipped run has no distance or time.");
        }

        if (answers.DistanceKm is { } km && (!double.IsFinite(km) || km <= 0 || km > MaxDistanceKm))
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
        ActualSessionType = answers.ActualSessionType;
        DistanceUnreported = answers.DistanceUnreported;
        ActivityId = answers.ActivityId;
    }
}
