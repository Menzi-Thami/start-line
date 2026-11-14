using StartLine.Domain.Common;

namespace StartLine.Domain.Journey;

/// <summary>
/// "Keep running comfortably" after a race or recovery: easy runs on the runner's days, no race date. One active per
/// runner (a filtered unique index enforces it). The weeks are built by <see cref="MaintenanceGenerator"/> on read.
/// </summary>
public sealed class MaintenancePlan
{
    private MaintenancePlan()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public int DaysPerWeek { get; private set; }

    public IReadOnlyList<DayOfWeek> RunDays { get; private set; } = [];

    public bool IncludeStrength { get; private set; }

    public DateOnly StartedOn { get; private set; }

    public MaintenanceStatus Status { get; private set; }

    public int GeneratorVersion { get; private set; }

    public DateOnly? EndedOn { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public byte[] Version { get; private set; } = [];

    public static MaintenancePlan Start(Guid runnerId, int daysPerWeek, IReadOnlyList<DayOfWeek>? runDays, bool includeStrength, IReadOnlyList<DayOfWeek>? fallbackDays, DateOnly today)
    {
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("Easy running belongs to a runner.");
        }

        var plan = new MaintenancePlan
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            StartedOn = today,
            Status = MaintenanceStatus.Active,
            GeneratorVersion = MaintenanceGenerator.Version,
        };
        plan.Change(daysPerWeek, runDays, includeStrength, fallbackDays);
        return plan;
    }

    /// <summary>New answers for the running plan already going: it keeps its start date.</summary>
    public void Change(int daysPerWeek, IReadOnlyList<DayOfWeek>? runDays, bool includeStrength, IReadOnlyList<DayOfWeek>? fallbackDays)
    {
        if (Status != MaintenanceStatus.Active)
        {
            throw new DomainException("This running plan has ended. Start a new one.");
        }

        RunDays = MaintenanceGenerator.DaysFor(daysPerWeek, runDays, fallbackDays);
        DaysPerWeek = daysPerWeek;
        IncludeStrength = includeStrength;
    }

    /// <summary>Would these answers change anything? A repeated request is the same plan.</summary>
    public bool IsSameAs(int daysPerWeek, IReadOnlyList<DayOfWeek>? runDays, bool includeStrength, IReadOnlyList<DayOfWeek>? fallbackDays) =>
        DaysPerWeek == daysPerWeek && IncludeStrength == includeStrength
        && MaintenanceGenerator.DaysFor(daysPerWeek, runDays, fallbackDays).SequenceEqual(RunDays);

    public void End(DateOnly today)
    {
        if (Status == MaintenanceStatus.Ended)
        {
            return;
        }

        Status = MaintenanceStatus.Ended;
        EndedOn = today;
    }

    public IReadOnlyList<MaintenanceWeek> Weeks(DateOnly today) => MaintenanceGenerator.Build(RunDays, IncludeStrength, StartedOn, today);
}
