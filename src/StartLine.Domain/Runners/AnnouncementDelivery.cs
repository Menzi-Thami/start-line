namespace StartLine.Domain.Runners;

public enum AnnouncementDeliveryStatus { Sending, Sent, Failed }

/// <summary>
/// One "what's new" announcement to one runner, claimed before it's sent: one row per runner and campaign (a unique
/// index), so a restart, a retry or a second app instance can never send it twice. A failed send is tried again a few
/// times; a claim left in <see cref="AnnouncementDeliveryStatus.Sending"/> by a crash is never resent, because the email
/// may have gone. Only runners who said yes to news and updates are ever sent one (docs/email.md).
/// </summary>
public sealed class AnnouncementDelivery
{
    public const int MaxAttempts = 3;
    public const int MaxCampaignLength = 40;

    private AnnouncementDelivery()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    /// <summary>Which announcement, for example "redesign-2026-11".</summary>
    public string Campaign { get; private set; } = "";

    public AnnouncementDeliveryStatus Status { get; private set; }

    public int Attempts { get; private set; }

    public DateTimeOffset ClaimedAt { get; private set; }

    public DateTimeOffset? SentAt { get; private set; }

    public static AnnouncementDelivery Claim(Guid runnerId, string campaign, DateTimeOffset at)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(campaign);
        return campaign.Length > MaxCampaignLength
            ? throw new ArgumentOutOfRangeException(nameof(campaign))
            : new()
            {
                Id = Guid.NewGuid(),
                RunnerId = runnerId,
                Campaign = campaign,
                Status = AnnouncementDeliveryStatus.Sending,
                Attempts = 1,
                ClaimedAt = at,
            };
    }

    public bool CanRetry => Status == AnnouncementDeliveryStatus.Failed && Attempts < MaxAttempts;
}
