using StartLine.Domain.Common;

namespace StartLine.Domain.Plans;

public enum SavedPlanStatus
{
    /// <summary>The runner's current plan. At most one per runner (a unique index in the database enforces it).</summary>
    Active,

    /// <summary>A past plan: replaced by a newer one. Kept read-only, with the runs that were matched to it.</summary>
    Archived,
}

/// <summary>
/// What the runner asked for, exactly as they asked for it. The race is stored by slug, not by date,
/// so when the race calendar learns a new date the saved plan follows it. Sessions are generated
/// from these inputs on read; nothing about the schedule is frozen here yet. A replan is stored the same way: as the
/// answers that rebuild the plan from a date, never as the rebuilt sessions. <see cref="GeneratorVersion"/> is the
/// generator version the plan was first built with, so a saved plan keeps its shape when newer versions arrive.
/// <see cref="StartOn"/> is the day the runner chose to start, if they chose one. <see cref="RunWalk"/> is their run/walk
/// choice; null is Auto, as every plan saved before it.
/// </summary>
public sealed record SavedPlanInputs(
    string? RaceSlug,
    string? RaceName,
    double? DistanceKm,
    DateOnly? RaceDate,
    TimeSpan GoalTime,
    IReadOnlyList<DayOfWeek> RunDays,
    DayOfWeek LongRunDay,
    double? CurrentWeeklyKm,
    Experience Experience,
    IReadOnlyList<DayOfWeek> StrengthDays,
    DateOnly PlanFrom,
    DateOnly? ReplanFrom = null,
    Setback? Setback = null,
    double? RecentWeeklyKm = null,
    int GeneratorVersion = TrainingPlanGenerator.OriginalVersion,
    DateOnly? StartOn = null,
    RunWalkMode? RunWalk = null)
{
    /// <summary>The latest replan, if the runner has rebuilt the plan after a setback.</summary>
    public PlanReplan? Replan => ReplanFrom is { } from && Setback is { } setback ? new PlanReplan(from, setback, RecentWeeklyKm) : null;
}

public sealed class SavedPlan
{
    public const int MaxNameLength = 100;
    /// <summary>One plan at a time: Overview, run matching and the dashboard all have a single answer.</summary>
    public const int MaxActivePerRunner = 1;

    /// <summary>Current plus past plans. A runner past this deletes an old past plan to make room.</summary>
    public const int MaxKeptPerRunner = 50;

    private SavedPlan()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public string Name { get; private set; } = "";

    public SavedPlanInputs Inputs { get; private set; } = null!;

    public SavedPlanStatus Status { get; private set; }

    public IReadOnlyList<SessionRevision> Adjustments { get; private set; } = [];

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    /// <summary>Concurrency token: two devices editing one plan can't silently overwrite each other.</summary>
    public byte[] Version { get; private set; } = [];

    public static SavedPlan Create(Guid runnerId, string name, SavedPlanInputs inputs)
    {
        ArgumentNullException.ThrowIfNull(inputs);
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("A saved plan belongs to a runner.");
        }

        var plan = new SavedPlan
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            Inputs = inputs,
            Status = SavedPlanStatus.Active,
        };
        plan.Rename(name);
        return plan;
    }

    /// <summary>Same race, new answers (a goal time, the days): the plan changes in place, keeping its id.</summary>
    public void Update(SavedPlanInputs inputs)
    {
        ArgumentNullException.ThrowIfNull(inputs);
        if (Status != SavedPlanStatus.Active)
        {
            throw new DomainException("Only the current plan can be changed. Make a past plan current first.");
        }

        Inputs = inputs;
    }

    /// <summary>
    /// Rebuilds the current plan from a setback onwards. A plan keeps one replan: a second one replaces the first, and
    /// null undoes it, so the plan is back as first built.
    /// </summary>
    public void Replan(PlanReplan? replan) =>
        Update(Inputs with { ReplanFrom = replan?.From, Setback = replan?.Setback, RecentWeeklyKm = replan?.RecentWeeklyKm });

    public void AdjustRemainingWeek(IReadOnlyList<SessionRevision> revisions, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(revisions);
        if (Status != SavedPlanStatus.Active || revisions.Any(r => r.AppliedOn != today || r.Date <= today
            || r.Date > today.AddDays(6 - ((int)today.DayOfWeek + 6) % 7) || r.OriginalType is SessionType.Strength or SessionType.Race
            || r.EasyKm is < RemainingWeek.MinimumRunKm || r.EasyKm is { } km && !double.IsFinite(km)
            || r.EasyKm > r.OriginalKm || r.EasyKm > RemainingWeek.ResetRunLimitKm))
            throw new DomainException("Only upcoming runs in the current week can be eased. Past sessions stay unchanged.");
        var changes = Adjustments.ToDictionary(r => r.Date);
        foreach (var revision in revisions)
            changes[revision.Date] = changes.TryGetValue(revision.Date, out var original)
                ? revision with { OriginalType = original.OriginalType, OriginalTitle = original.OriginalTitle, OriginalKm = original.OriginalKm }
                : revision;
        Adjustments = [.. changes.Values.OrderBy(r => r.Date)];
    }

    /// <summary>Is this the same race as <paramref name="inputs"/>: the same catalogue race, or the same named race on the same date.</summary>
    public bool IsForSameRace(SavedPlanInputs inputs)
    {
        ArgumentNullException.ThrowIfNull(inputs);
        return Inputs.RaceSlug is { } slug
            ? string.Equals(slug, inputs.RaceSlug, StringComparison.OrdinalIgnoreCase)
            : inputs.RaceSlug is null
                && string.Equals(Inputs.RaceName?.Trim(), inputs.RaceName?.Trim(), StringComparison.OrdinalIgnoreCase)
                && Inputs.RaceDate == inputs.RaceDate;
    }

    /// <summary>Replaced by a newer plan: it becomes a past plan.</summary>
    public void Archive() => Status = SavedPlanStatus.Archived;

    /// <summary>A past plan made current again. The caller archives whichever plan was current.</summary>
    public void Restore() => Status = SavedPlanStatus.Active;

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > MaxNameLength)
        {
            throw new DomainException($"A plan name is required and can be at most {MaxNameLength} characters.");
        }

        Name = name.Trim();
    }
}
