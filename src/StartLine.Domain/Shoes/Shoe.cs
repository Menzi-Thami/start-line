using StartLine.Domain.Common;

namespace StartLine.Domain.Shoes;

/// <summary>How far a shoe is through its life, against the limit the runner set.</summary>
public enum ShoeWear
{
    Fine,

    /// <summary>Nine-tenths of the way to its limit: time to think about the next pair.</summary>
    NearingLimit,

    PastLimit,
}

/// <summary>
/// A pair of running shoes and how far they've gone. The distance is never stored: it's the kilometres the runner says
/// the pair had already done when they added it, plus the runs assigned to it, worked out whenever it's read. So a run
/// that's deleted, or a Strava copy that lapses, simply stops counting, and nothing derived from Strava is kept.
/// </summary>
public sealed class Shoe
{
    public const int MaxPerRunner = 30;
    public const int MaxNameLength = 60;
    public const double DefaultLimitKm = 700;
    public const double MinLimitKm = 100;
    public const double MaxLimitKm = 3000;
    public const double MaxStartingKm = 5000;

    /// <summary>The share of the limit at which a pair counts as nearing it.</summary>
    public const double NearingShare = 0.9;

    private Shoe()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    /// <summary>What the pair had already run before it was added to Taperday.</summary>
    public double StartingKm { get; private set; }

    /// <summary>When the runner wants to replace the pair. Many runners retire shoes at 500–800 km.</summary>
    public double LimitKm { get; private set; }

    /// <summary>New runs (uploads and synced runs) are put on this pair automatically. At most one per runner.</summary>
    public bool IsDefault { get; private set; }

    /// <summary>Send one reminder when the pair reaches its limit.</summary>
    public bool RemindAtLimit { get; private set; }

    /// <summary>The limit the last reminder was for, so each limit reminds once (changing the limit can remind again).</summary>
    public double? RemindedAtLimitKm { get; private set; }

    /// <summary>Set when the runner retires the pair: it stays in the history but takes no new runs.</summary>
    public DateTimeOffset? RetiredAt { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public bool IsRetired => RetiredAt is not null;

    public static Shoe Create(Guid runnerId, string name, double startingKm, double limitKm, bool remindAtLimit)
    {
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("A shoe belongs to a runner.");
        }

        var shoe = new Shoe { Id = Guid.NewGuid(), RunnerId = runnerId };
        shoe.Edit(name, startingKm, limitKm, remindAtLimit);
        return shoe;
    }

    public void Edit(string name, double startingKm, double limitKm, bool remindAtLimit)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is 0 or > MaxNameLength)
        {
            throw new DomainException($"Give the shoes a name of up to {MaxNameLength} characters.");
        }

        if (startingKm is < 0 or > MaxStartingKm || double.IsNaN(startingKm))
        {
            throw new DomainException($"The distance already run is between 0 and {MaxStartingKm:0} km.");
        }

        if (limitKm is < MinLimitKm or > MaxLimitKm || double.IsNaN(limitKm))
        {
            throw new DomainException($"The replacement distance is between {MinLimitKm:0} and {MaxLimitKm:0} km.");
        }

        Name = trimmed;
        StartingKm = Math.Round(startingKm, 1);
        LimitKm = Math.Round(limitKm);
        RemindAtLimit = remindAtLimit;
    }

    public void MakeDefault()
    {
        if (IsRetired)
        {
            throw new DomainException("Retired shoes can't take new runs. Bring them back first.");
        }

        IsDefault = true;
    }

    public void ClearDefault() => IsDefault = false;

    public void Retire(DateTimeOffset now)
    {
        RetiredAt ??= now;
        IsDefault = false;
    }

    public void Return() => RetiredAt = null;

    public ShoeWear WearAt(double totalKm) =>
        totalKm >= LimitKm ? ShoeWear.PastLimit : totalKm >= LimitKm * NearingShare ? ShoeWear.NearingLimit : ShoeWear.Fine;

    /// <summary>True once the pair has reached its limit and hasn't yet reminded the runner about this limit.</summary>
    public bool ShouldRemind(double totalKm) => RemindAtLimit && !IsRetired && totalKm >= LimitKm && RemindedAtLimitKm != LimitKm;

    public void MarkReminded() => RemindedAtLimitKm = LimitKm;
}

/// <summary>
/// One run worn in one pair: an uploaded or synced run, or a run the runner checked in by hand with a distance. Only
/// the ids are kept; the distance is read from the run itself, so it's never copied (and never outlives a Strava copy).
/// </summary>
public sealed class ShoeAssignment
{
    private ShoeAssignment()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public Guid ShoeId { get; private set; }

    public Guid? ActivityId { get; private set; }

    public Guid? CheckInId { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public static ShoeAssignment ForActivity(Guid runnerId, Guid shoeId, Guid activityId) => Create(runnerId, shoeId, activityId, null);

    public static ShoeAssignment ForCheckIn(Guid runnerId, Guid shoeId, Guid checkInId) => Create(runnerId, shoeId, null, checkInId);

    /// <summary>The run was replaced by the same run from another source (an upload replacing a synced copy): follow it.</summary>
    public void MoveToActivity(Guid activityId) => ActivityId = activityId;

    public void MoveToShoe(Guid shoeId) => ShoeId = shoeId == Guid.Empty ? throw new DomainException("Choose a pair of shoes.") : shoeId;

    private static ShoeAssignment Create(Guid runnerId, Guid shoeId, Guid? activityId, Guid? checkInId)
    {
        if (runnerId == Guid.Empty || shoeId == Guid.Empty || (activityId is null) == (checkInId is null))
        {
            throw new DomainException("A shoe is worn on exactly one run.");
        }

        return new ShoeAssignment { Id = Guid.NewGuid(), RunnerId = runnerId, ShoeId = shoeId, ActivityId = activityId, CheckInId = checkInId };
    }
}
