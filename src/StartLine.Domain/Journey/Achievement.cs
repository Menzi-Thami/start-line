using StartLine.Domain.Common;

namespace StartLine.Domain.Journey;

/// <summary>
/// A badge a plan earned. One of each kind per plan (a unique index enforces it, so a duplicate from a concurrent
/// request is "already awarded"). <see cref="CelebratedAt"/> makes the celebration play once across the runner's devices.
/// </summary>
public sealed class Achievement
{
    private Achievement()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public Guid SavedPlanId { get; private set; }

    public AchievementKind Kind { get; private set; }

    /// <summary>The runner's local date it was earned: the last confirmed training run, or the race date.</summary>
    public DateOnly EarnedOn { get; private set; }

    public DateTimeOffset AwardedAt { get; private set; }

    public DateTimeOffset? CelebratedAt { get; private set; }

    public static Achievement Award(Guid runnerId, Guid savedPlanId, AchievementKind kind, DateOnly earnedOn, DateTimeOffset now)
    {
        if (runnerId == Guid.Empty || savedPlanId == Guid.Empty || !Enum.IsDefined(kind))
        {
            throw new DomainException("An achievement belongs to a runner's plan.");
        }

        return new Achievement { Id = Guid.NewGuid(), RunnerId = runnerId, SavedPlanId = savedPlanId, Kind = kind, EarnedOn = earnedOn, AwardedAt = now };
    }

    /// <summary>The race date was corrected, say: the badge stays, dated as it now is.</summary>
    public void Redate(DateOnly earnedOn) => EarnedOn = earnedOn;

    /// <summary>Idempotent: the first celebration is the one remembered.</summary>
    public void Celebrate(DateTimeOffset now) => CelebratedAt ??= now;
}
