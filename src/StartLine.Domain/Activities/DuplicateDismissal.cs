using StartLine.Domain.Common;

namespace StartLine.Domain.Activities;

/// <summary>
/// The runner looked at two runs that overlap in time and said both are real (a warm-up and a race, a run with a
/// friend recorded on two watches they both want kept). Stops Taperday asking again about that pair.
/// </summary>
public sealed class DuplicateDismissal
{
    private DuplicateDismissal()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    /// <summary>The smaller of the two ids, so a pair is stored one way round whichever order it was dismissed in.</summary>
    public Guid FirstActivityId { get; private set; }

    public Guid SecondActivityId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public static DuplicateDismissal Of(Guid runnerId, Guid oneActivityId, Guid otherActivityId, DateTimeOffset now)
    {
        if (runnerId == Guid.Empty || oneActivityId == Guid.Empty || otherActivityId == Guid.Empty)
        {
            throw new DomainException("A dismissed pair needs a runner and two runs.");
        }

        if (oneActivityId == otherActivityId)
        {
            throw new DomainException("A run can't be a duplicate of itself.");
        }

        var (first, second) = Order(oneActivityId, otherActivityId);
        return new DuplicateDismissal { Id = Guid.NewGuid(), RunnerId = runnerId, FirstActivityId = first, SecondActivityId = second, CreatedAt = now };
    }

    public static (Guid First, Guid Second) Order(Guid one, Guid other) => one.CompareTo(other) < 0 ? (one, other) : (other, one);
}
