namespace StartLine.Domain.Runners;

/// <summary>
/// The three onboarding emails (docs/onboarding-reminders.md). A runner is in at most one cohort at a time, and each email
/// goes once: the first two once ever, the third once per stretch of inactivity.
/// </summary>
public enum OnboardingCampaign
{
    /// <summary>Signed up at least 48 hours ago and has never saved a plan: "Your starting line is waiting".</summary>
    StartPlan,

    /// <summary>First plan saved at least 7 days ago and no run recorded since: "Your first run is waiting".</summary>
    FirstRun,

    /// <summary>Recorded runs before, none for at least 21 days: one gentle "ready when you are" per quiet spell.</summary>
    ReturnToRunning,

    /// <summary>Signed up in the last two days: one "Welcome to Taperday", sent once, soon after the account is made.</summary>
    Welcome,

    /// <summary>
    /// Not an onboarding email: the weekly coaching tip (docs/coaching-tips.md), one per runner per Thursday, sharing this
    /// delivery record. <see cref="OnboardingDelivery.Episode"/> is that Thursday and <see cref="OnboardingDelivery.TipKey"/>
    /// the tip that went. It belongs to the runner's weekly emails, so the onboarding rules never count it.
    /// </summary>
    CoachingTip,
}

public enum OnboardingDeliveryStatus { Sending, Sent, Failed }

/// <summary>
/// One onboarding email to one runner, claimed before it's sent: one row per runner, campaign and episode (a unique
/// index), so a restart, a retry or a second app instance can never send it twice. A failed send is tried again a few
/// times; a claim left in <see cref="OnboardingDeliveryStatus.Sending"/> by a crash is never resent, because the email may
/// have gone. <see cref="Episode"/> is empty for the once-ever emails, and for <see cref="OnboardingCampaign.ReturnToRunning"/>
/// the day of the last recorded run before the quiet spell (yyyy-MM-dd), so only fresh running opens a new episode. For
/// <see cref="OnboardingCampaign.CoachingTip"/> it is the runner's Thursday (yyyy-MM-dd), and <see cref="TipKey"/> names the tip.
/// </summary>
public sealed class OnboardingDelivery
{
    public const int MaxAttempts = 3;
    public const int MaxEpisodeLength = 16;
    public const int MaxTipKeyLength = 16;

    private OnboardingDelivery()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public OnboardingCampaign Campaign { get; private set; }

    public string Episode { get; private set; } = "";

    /// <summary>
    /// Which coaching tip went (a key from the tip bank, such as "a-3" or "taper-1"); null for every onboarding email. It
    /// names the tip and nothing more: no distances or other running figures are kept.
    /// </summary>
    public string? TipKey { get; private set; }

    public OnboardingDeliveryStatus Status { get; private set; }

    public int Attempts { get; private set; }

    public DateTimeOffset ClaimedAt { get; private set; }

    public DateTimeOffset? SentAt { get; private set; }

    public static OnboardingDelivery Claim(Guid runnerId, OnboardingCampaign campaign, string episode, DateTimeOffset at, string? tipKey = null)
    {
        ArgumentNullException.ThrowIfNull(episode);
        if (tipKey is { Length: 0 or > MaxTipKeyLength })
        {
            throw new ArgumentOutOfRangeException(nameof(tipKey));
        }

        return episode.Length > MaxEpisodeLength
            ? throw new ArgumentOutOfRangeException(nameof(episode))
            : new()
            {
                Id = Guid.NewGuid(),
                RunnerId = runnerId,
                Campaign = campaign,
                Episode = episode,
                TipKey = tipKey,
                Status = OnboardingDeliveryStatus.Sending,
                Attempts = 1,
                ClaimedAt = at,
            };
    }

    public bool CanRetry => Status == OnboardingDeliveryStatus.Failed && Attempts < MaxAttempts;

    /// <summary>Whether the email may have reached the runner: sent, or claimed and never finished (a crash mid-send).</summary>
    public bool MayHaveGone => Status != OnboardingDeliveryStatus.Failed;
}
