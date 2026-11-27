namespace StartLine.Domain.Plans;

/// <summary>A short-lived, owner-bound reviewed import. No bearer token is stored.</summary>
public sealed class PrivatePlanImport
{
    private PrivatePlanImport() { }
    public Guid Id { get; private set; }
    public Guid RunnerId { get; private set; }
    public string Name { get; private set; } = "";
    public SavedPlanInputs Inputs { get; private set; } = null!;
    public PrivatePrescription Prescription { get; private set; } = null!;
    public Guid? ExpectedActiveId { get; private set; }
    public string? ExpectedActiveVersion { get; private set; }
    public string TokenHash { get; private set; } = "";
    public DateOnly ReviewedOn { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public Guid? ActivatedPlanId { get; private set; }

    public static PrivatePlanImport Create(Guid runnerId, string name, SavedPlanInputs inputs, PrivatePrescription prescription,
        SavedPlan? active, string tokenHash, DateOnly today, DateTimeOffset now) => new()
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            Name = name,
            Inputs = inputs,
            Prescription = prescription,
            ExpectedActiveId = active?.Id,
            ExpectedActiveVersion = active is null ? null : Convert.ToBase64String(active.Version),
            TokenHash = tokenHash,
            ReviewedOn = today,
            ExpiresAt = now.AddMinutes(30),
        };

    public void Activate(Guid planId) => ActivatedPlanId = planId;
}

public sealed record PrivateGymCompletion(Guid SessionId, DateOnly Date, int? Effort, DateTimeOffset RecordedAt);
public sealed record PrivateGymMove(Guid SessionId, DateOnly Date);
