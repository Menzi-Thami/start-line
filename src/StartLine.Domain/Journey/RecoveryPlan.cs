using StartLine.Domain.Common;

namespace StartLine.Domain.Journey;

/// <summary>
/// A runner's recovery after a race: optional, never auto-started, and never escalating without the runner saying they
/// are ready. The days themselves aren't stored; they're built by <see cref="RecoveryGenerator"/> (at
/// <see cref="GeneratorVersion"/>) from these answers, the pauses and the check-ins whenever it's read.
/// </summary>
public sealed class RecoveryPlan
{
    public const int MaxEventNameLength = 100;
    public const int MaxNoteLength = 280;
    public const double MinDistanceKm = 0.1;
    public const double MaxDistanceKm = 400;

    /// <summary>A recovery for an event outside a saved plan: the event was in the last this many days.</summary>
    public const int ManualWindowDays = 60;
    public const int MaxExtendDays = 14;
    public const int MaxExtraDays = 42;
    public const int MaxCheckIns = 200;
    public const int MaxPauses = 50;

    private RecoveryPlan()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    /// <summary>The plan whose race this recovers from, or null for an event outside a plan.</summary>
    public Guid? SavedPlanId { get; private set; }

    public string EventName { get; private set; } = "";

    public double DistanceKm { get; private set; }

    public DateOnly RaceDate { get; private set; }

    public RecoveryEffort Effort { get; private set; }

    public RecoveryPreference Preference { get; private set; }

    public IReadOnlyList<DayOfWeek> RunDays { get; private set; } = [];

    public RecoveryStatus Status { get; private set; }

    public int GeneratorVersion { get; private set; }

    public int ExtraDays { get; private set; }

    public IReadOnlyList<RecoveryPause> Pauses { get; private set; } = [];

    public IReadOnlyList<RecoveryCheckIn> CheckIns { get; private set; } = [];

    public DateOnly? EndedOn { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Concurrency token: a change from another device is never silently overwritten.</summary>
    public byte[] Version { get; private set; } = [];

    public bool IsOpen => Status is RecoveryStatus.Active or RecoveryStatus.Paused;

    public static RecoveryPlan Start(
        Guid runnerId, Guid? savedPlanId, string? eventName, double distanceKm, DateOnly raceDate, RecoveryEffort effort,
        RecoveryPreference preference, IReadOnlyList<DayOfWeek>? runDays, DateOnly today)
    {
        if (runnerId == Guid.Empty || savedPlanId == Guid.Empty)
        {
            throw new DomainException("A recovery belongs to a runner.");
        }

        if (!double.IsFinite(distanceKm) || distanceKm < MinDistanceKm || distanceKm > MaxDistanceKm)
        {
            throw new DomainException($"The distance is between {MinDistanceKm} and {MaxDistanceKm:0} km.");
        }

        if (raceDate > today)
        {
            throw new DomainException("A recovery starts after the race, not before it.");
        }

        if (savedPlanId is null && raceDate < today.AddDays(-ManualWindowDays))
        {
            throw new DomainException($"A recovery can be started for an event in the last {ManualWindowDays} days.");
        }

        var name = string.IsNullOrWhiteSpace(eventName) ? "Your race" : eventName.Trim();
        if (name.Length > MaxEventNameLength)
        {
            throw new DomainException($"Keep the event name to {MaxEventNameLength} characters.");
        }

        var plan = new RecoveryPlan
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            SavedPlanId = savedPlanId,
            EventName = name,
            DistanceKm = Math.Round(distanceKm, 2),
            RaceDate = raceDate,
            Status = RecoveryStatus.Active,
            GeneratorVersion = RecoveryGenerator.Version,
        };
        plan.Update(effort, preference, runDays ?? []);
        return plan;
    }

    public RecoverySchedule Schedule(DateOnly today) =>
        RecoveryGenerator.Build(new RecoveryInputs(DistanceKm, RaceDate, Effort, Preference, RunDays, ExtraDays, Pauses, CheckIns), today);

    /// <summary>How the runner feels on a day from race day to today. One per date: a second answer replaces the first.</summary>
    public void CheckIn(DateOnly date, RecoveryFeeling feeling, IReadOnlyList<RecoveryRedFlag>? redFlags, string? note, DateOnly today)
    {
        RequireOpen();
        if (!Enum.IsDefined(feeling) || (redFlags ?? []).Any(f => !Enum.IsDefined(f)))
        {
            throw new DomainException("Unknown answer in the check-in.");
        }

        if (date < RaceDate || date > today)
        {
            throw new DomainException("Check in for a day from race day to today.");
        }

        var trimmed = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        if (trimmed?.Length > MaxNoteLength)
        {
            throw new DomainException($"Keep the note to {MaxNoteLength} characters.");
        }

        var others = CheckIns.Where(c => c.Date != date).ToList();
        if (others.Count >= MaxCheckIns)
        {
            throw new DomainException($"A recovery keeps up to {MaxCheckIns} check-ins.");
        }

        CheckIns = [.. others.Append(new RecoveryCheckIn(date, feeling, [.. (redFlags ?? []).Distinct().Order()], trimmed)).OrderBy(c => c.Date)];
    }

    /// <summary>Pausing again while paused changes nothing. Paused days don't move the recovery on.</summary>
    public void Pause(DateOnly today)
    {
        RequireOpen();
        if (Status == RecoveryStatus.Paused)
        {
            return;
        }

        var resumedToday = Pauses.FirstOrDefault(p => p.To == today);
        if (resumedToday is null && Pauses.Count >= MaxPauses)
        {
            throw new DomainException("This recovery has been paused too many times. End it and start again instead.");
        }

        Pauses = resumedToday is null
            ? [.. Pauses, new RecoveryPause(Max(today, RaceDate.AddDays(1)), null)]
            : [.. Pauses.Select(p => p == resumedToday ? p with { To = null } : p)];
        Status = RecoveryStatus.Paused;
    }

    /// <summary>Resuming while active changes nothing. A pause resumed the day it began leaves no trace.</summary>
    public void Resume(DateOnly today)
    {
        RequireOpen();
        if (Status == RecoveryStatus.Active)
        {
            return;
        }

        ClosePause(today);
        Status = RecoveryStatus.Active;
    }

    public void Extend(int days)
    {
        RequireOpen();
        if (days is < 1 or > MaxExtendDays)
        {
            throw new DomainException($"Add between 1 and {MaxExtendDays} days.");
        }

        if (ExtraDays + days > MaxExtraDays)
        {
            throw new DomainException($"A recovery can be lengthened by up to {MaxExtraDays} days in all.");
        }

        ExtraDays += days;
    }

    /// <summary>Finishes recovery. Only once the latest check-in says "Good to go".</summary>
    public void Complete(DateOnly today)
    {
        if (Status == RecoveryStatus.Completed)
        {
            return;
        }

        RequireOpen();
        if (!Schedule(today).CanComplete)
        {
            throw new DomainException("Check in as \"Good to go\" before finishing your recovery.");
        }

        ClosePause(today);
        Status = RecoveryStatus.Completed;
        EndedOn = today;
    }

    /// <summary>Stops the recovery early. Nothing is lost.</summary>
    public void End(DateOnly today)
    {
        if (Status == RecoveryStatus.Ended)
        {
            return;
        }

        RequireOpen();
        ClosePause(today);
        Status = RecoveryStatus.Ended;
        EndedOn = today;
    }

    /// <summary>
    /// Starts the recovery again from today: today is its first rest day. The days since the race no longer count
    /// (they show as a pause), the added days go, and the check-ins stay, so the readiness gate still holds.
    /// </summary>
    public void Restart(DateOnly today)
    {
        if (today < RaceDate)
        {
            throw new DomainException("A recovery starts after the race.");
        }

        var firstDay = RaceDate.AddDays(1);
        Pauses = today > firstDay ? [new RecoveryPause(firstDay, today)] : [];
        ExtraDays = 0;
        Status = RecoveryStatus.Active;
        EndedOn = null;
    }

    public void Update(RecoveryEffort effort, RecoveryPreference preference, IReadOnlyList<DayOfWeek> runDays)
    {
        ArgumentNullException.ThrowIfNull(runDays);
        if (!Enum.IsDefined(effort) || !Enum.IsDefined(preference) || runDays.Any(d => !Enum.IsDefined(d)))
        {
            throw new DomainException("Unknown answer for the recovery.");
        }

        Effort = effort;
        Preference = preference;
        RunDays = JourneyDays.Ordered(runDays);
    }

    private void RequireOpen()
    {
        if (!IsOpen)
        {
            throw new DomainException("This recovery has finished. Restart it to carry on.");
        }
    }

    private void ClosePause(DateOnly today)
    {
        var open = Pauses.FirstOrDefault(p => p.To is null);
        if (open is null)
        {
            return;
        }

        Pauses = open.From >= today
            ? [.. Pauses.Where(p => p != open)]
            : [.. Pauses.Select(p => p == open ? p with { To = today } : p)];
    }

    private static DateOnly Max(DateOnly a, DateOnly b) => a > b ? a : b;
}
