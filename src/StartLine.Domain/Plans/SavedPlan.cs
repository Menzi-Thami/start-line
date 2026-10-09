using StartLine.Domain.Common;

namespace StartLine.Domain.Plans;

public enum SavedPlanStatus
{
    Active,
    Archived,
}

/// <summary>
/// What the runner asked for, exactly as they asked for it. The race is stored by slug, not by date,
/// so when the race calendar learns a new date the saved plan follows it. Sessions are generated
/// from these inputs on read; nothing about the schedule is frozen here yet.
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
    DateOnly PlanFrom);

public sealed class SavedPlan
{
    public const int MaxNameLength = 100;
    public const int MaxActivePerRunner = 20;

    private SavedPlan()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public string Name { get; private set; } = "";

    public SavedPlanInputs Inputs { get; private set; } = null!;

    public SavedPlanStatus Status { get; private set; }

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

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > MaxNameLength)
        {
            throw new DomainException($"A plan name is required and can be at most {MaxNameLength} characters.");
        }

        Name = name.Trim();
    }
}
