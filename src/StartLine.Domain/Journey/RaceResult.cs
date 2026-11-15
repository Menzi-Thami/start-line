using StartLine.Domain.Common;

namespace StartLine.Domain.Journey;

/// <summary>What the runner says happened on race day. The date is their local date; only the run's id is kept.</summary>
public sealed record RaceResultAnswers(
    RaceOutcome Outcome,
    DateOnly RaceDate,
    TimeSpan? FinishTime = null,
    double? DistanceKm = null,
    Guid? ActivityId = null,
    string? Note = null);

/// <summary>
/// The result of a race, recorded by the runner, optionally attached to a training plan. One per plan. It earns a finisher
/// badge: a race date passing, a synced run or a ticked shakeout never does.
/// </summary>
public sealed class RaceResult
{
    public const int MaxNoteLength = 280;
    public const int MaxEventNameLength = 120;
    public const double MinDistanceKm = 0.1;
    public const double MaxDistanceKm = 400;
    public static readonly TimeSpan MinFinishTime = TimeSpan.FromMinutes(1);
    public static readonly TimeSpan MaxFinishTime = TimeSpan.FromHours(48);

    private RaceResult()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public Guid? SavedPlanId { get; private set; }

    public string EventName { get; private set; } = "";

    /// <summary>The event's advertised distance, separate from the runner's actual recorded distance.</summary>
    public double? EventDistanceKm { get; private set; }

    public MarathonMajor? Major { get; private set; }

    public RaceTimeKind TimeKind { get; private set; }

    /// <summary>One runner, one event edition. Legacy rows receive a key when their retained identity is confirmed.</summary>
    public string? RaceKey { get; private set; }

    public RaceOutcome Outcome { get; private set; }

    public DateOnly RaceDate { get; private set; }

    public TimeSpan? FinishTime { get; private set; }

    public double? DistanceKm { get; private set; }

    /// <summary>A link to the runner's own recorded run, never a copy of it.</summary>
    public Guid? ActivityId { get; private set; }

    public string? Note { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Concurrency token: two devices can't silently overwrite each other's result.</summary>
    public byte[] Version { get; private set; } = [];

    /// <param name="planStart">The first day of the plan: a race result can't be before it.</param>
    /// <param name="today">The runner's local today: a result can't be for a day still to come.</param>
    public static RaceResult Record(Guid runnerId, Guid savedPlanId, RaceResultAnswers answers, DateOnly planStart, DateOnly today)
    {
        if (runnerId == Guid.Empty || savedPlanId == Guid.Empty)
        {
            throw new DomainException("A race result belongs to a runner's plan.");
        }

        var result = new RaceResult { Id = Guid.NewGuid(), RunnerId = runnerId, SavedPlanId = savedPlanId };
        result.Change(answers, planStart, today);
        return result;
    }

    public static RaceResult RecordPast(Guid id, Guid runnerId, RaceResultAnswers answers, DateOnly today)
    {
        if (id == Guid.Empty || runnerId == Guid.Empty) throw new DomainException("A race belongs to a runner.");
        var result = new RaceResult { Id = id, RunnerId = runnerId };
        result.Change(answers, new DateOnly(1900, 1, 1), today);
        return result;
    }

    public void Identify(string eventName, double distanceKm, MarathonMajor? major, RaceTimeKind timeKind)
    {
        if (string.IsNullOrWhiteSpace(eventName) || eventName.Trim().Length > MaxEventNameLength)
            throw new DomainException($"Give the race a name of up to {MaxEventNameLength} characters.");
        if (!double.IsFinite(distanceKm) || distanceKm is < MinDistanceKm or > MaxDistanceKm)
            throw new DomainException("Choose an event distance between 0.1 and 400 km.");
        if (!Enum.IsDefined(timeKind) || (major is { } id && (!Enum.IsDefined(id) || !MarathonMajors.IsMarathon(distanceKm))))
            throw new DomainException("A Marathon Major must be the full marathon event.");
        EventName = eventName.Trim();
        EventDistanceKm = distanceKm;
        Major = major ?? MarathonMajors.Recognise(EventName, distanceKm);
        TimeKind = FinishTime is null ? RaceTimeKind.Unspecified : timeKind;
        RaceKey = MarathonMajors.RaceKey(EventName, distanceKm, RaceDate, Major);
    }

    public void Change(RaceResultAnswers answers, DateOnly planStart, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(answers);
        if (!Enum.IsDefined(answers.Outcome))
        {
            throw new DomainException("Say whether you finished, didn't start or didn't finish.");
        }

        if (answers.RaceDate > today)
        {
            throw new DomainException("A race result can be recorded on race day or after it.");
        }

        if (answers.RaceDate < planStart)
        {
            throw new DomainException("The race can't be before the plan started.");
        }

        if (answers.FinishTime is { } time && (time < MinFinishTime || time > MaxFinishTime))
        {
            throw new DomainException("A finish time is between 1 minute and 48 hours.");
        }

        if (answers.FinishTime is not null && answers.Outcome != RaceOutcome.Finished)
        {
            throw new DomainException("Only a finished race has a finish time.");
        }

        if (answers.DistanceKm is { } km && (!double.IsFinite(km) || km < MinDistanceKm || km > MaxDistanceKm))
        {
            throw new DomainException($"The distance is between {MinDistanceKm} and {MaxDistanceKm:0} km.");
        }

        if (answers.Outcome == RaceOutcome.DidNotStart && (answers.DistanceKm is not null || answers.ActivityId is not null))
        {
            throw new DomainException("A race you didn't start has no distance or run.");
        }

        if (answers.ActivityId == Guid.Empty)
        {
            throw new DomainException("Choose one of your runs.");
        }

        var note = string.IsNullOrWhiteSpace(answers.Note) ? null : answers.Note.Trim();
        if (note?.Length > MaxNoteLength)
        {
            throw new DomainException($"Keep the note to {MaxNoteLength} characters.");
        }

        Outcome = answers.Outcome;
        RaceDate = answers.RaceDate;
        FinishTime = answers.FinishTime;
        DistanceKm = answers.DistanceKm is { } d ? Math.Round(d, 2) : null;
        ActivityId = answers.ActivityId;
        Note = note;
        if (EventDistanceKm is { } eventKm && EventName.Length > 0)
            RaceKey = MarathonMajors.RaceKey(EventName, eventKm, RaceDate, Major);
        if (FinishTime is null) TimeKind = RaceTimeKind.Unspecified;
    }

    /// <summary>The finish time against the goal: negative is faster. Only for a finished race with a time.</summary>
    public TimeSpan? VersusGoal(TimeSpan? goal) =>
        Outcome == RaceOutcome.Finished && FinishTime is { } finish && goal is { } g && g > TimeSpan.Zero ? finish - g : null;

    /// <summary>A recovery can follow a race that was run: finished, or started and stopped.</summary>
    public bool WasRun => Outcome is RaceOutcome.Finished or RaceOutcome.DidNotFinish;
}
