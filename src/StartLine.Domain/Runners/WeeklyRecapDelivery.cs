namespace StartLine.Domain.Runners;

public enum RecapDeliveryStatus { Sending, Sent, Failed }

/// <summary>
/// One runner's weekly recap for one week: claimed before it's sent, so a restart, a retry or a second app instance can
/// never send the same week twice (one row per runner and week). A failed send is tried again a few times; a claim left
/// in <see cref="RecapDeliveryStatus.Sending"/> by a crash is never resent, because the email may have gone.
/// </summary>
public sealed class WeeklyRecapDelivery
{
    public const int MaxAttempts = 3;

    private WeeklyRecapDelivery()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    /// <summary>The Monday of the week the recap is about.</summary>
    public DateOnly WeekStart { get; private set; }

    public RecapDeliveryStatus Status { get; private set; }

    public int Attempts { get; private set; }

    public DateTimeOffset ClaimedAt { get; private set; }

    public DateTimeOffset? SentAt { get; private set; }

    public static WeeklyRecapDelivery Claim(Guid runnerId, DateOnly weekStart, DateTimeOffset at) => new()
    {
        Id = Guid.NewGuid(),
        RunnerId = runnerId,
        WeekStart = weekStart,
        Status = RecapDeliveryStatus.Sending,
        Attempts = 1,
        ClaimedAt = at,
    };

    public bool CanRetry => Status == RecapDeliveryStatus.Failed && Attempts < MaxAttempts;

    public void Sent(DateTimeOffset at)
    {
        Status = RecapDeliveryStatus.Sent;
        SentAt = at;
    }

    public void Failed() => Status = RecapDeliveryStatus.Failed;
}
