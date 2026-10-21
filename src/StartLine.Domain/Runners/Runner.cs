using StartLine.Domain.Activities;
using StartLine.Domain.Common;

namespace StartLine.Domain.Runners;

public enum Units
{
    Kilometres,
    Miles,
}

/// <summary>
/// A signed-up runner. Identity lives in the external identity provider; this holds only what the app
/// needs to coach them. Consent to the privacy notice is required before anything is stored.
/// </summary>
public sealed class Runner
{
    public const int MaxNameLength = 100;
    public const int MaxEmailLength = 254;
    public const int MaxTimeZoneLength = 64;

    private Runner()
    {
    }

    public Guid Id { get; private set; }

    /// <summary>The identity provider's stable user id (the token's <c>oid</c>), never an email.</summary>
    public string IdentitySubject { get; private set; } = "";

    public string? Email { get; private set; }

    public string DisplayName { get; private set; } = "";

    /// <summary>IANA zone, e.g. Africa/Johannesburg. Weekly emails go out in the runner's own morning.</summary>
    public string TimeZone { get; private set; } = "";

    public Units Units { get; private set; }

    public bool WeeklyEmails { get; private set; }

    /// <summary>Optional. With it, a run shows time in heart-rate zones; without it, Taperday doesn't guess.</summary>
    public int? MaxHeartRate { get; private set; }

    /// <summary>The version of the privacy notice the runner accepted, and when.</summary>
    public string PrivacyNoticeVersion { get; private set; } = "";

    public DateTimeOffset ConsentedAt { get; private set; }

    /// <summary>
    /// Whether the runner agreed to Taperday keeping heart rate from their runs. Heart rate is health information
    /// (special personal information under POPIA), so it's asked for separately and is optional: without it, runs are
    /// kept with no heart rate at all.
    /// </summary>
    public bool HeartRateConsent { get; private set; }

    /// <summary>When the runner last gave or withdrew heart-rate consent.</summary>
    public DateTimeOffset? HeartRateConsentChangedAt { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public static Runner Register(
        string identitySubject,
        string? email,
        string displayName,
        string timeZone,
        Units units,
        bool weeklyEmails,
        string privacyNoticeVersion,
        DateTimeOffset consentedAt,
        int? maxHeartRate = null,
        bool heartRateConsent = false)
    {
        if (string.IsNullOrWhiteSpace(identitySubject))
        {
            throw new DomainException("A runner needs an identity.");
        }

        if (string.IsNullOrWhiteSpace(privacyNoticeVersion))
        {
            throw new DomainException("A runner must accept the privacy notice before signing up.");
        }

        var runner = new Runner
        {
            Id = Guid.NewGuid(),
            IdentitySubject = identitySubject,
            PrivacyNoticeVersion = privacyNoticeVersion,
            ConsentedAt = consentedAt,
        };
        runner.UpdateProfile(email, displayName, timeZone, units, weeklyEmails, maxHeartRate);
        runner.SetHeartRateConsent(heartRateConsent, consentedAt);
        return runner;
    }

    public bool HasAccepted(string privacyNoticeVersion) =>
        string.Equals(PrivacyNoticeVersion, privacyNoticeVersion, StringComparison.Ordinal);

    /// <summary>Records that the runner read and accepted this version of the privacy notice.</summary>
    public void AcceptPrivacyNotice(string privacyNoticeVersion, DateTimeOffset at)
    {
        if (string.IsNullOrWhiteSpace(privacyNoticeVersion))
        {
            throw new DomainException("A privacy notice needs a version.");
        }

        PrivacyNoticeVersion = privacyNoticeVersion;
        ConsentedAt = at;
    }

    /// <summary>Gives or withdraws heart-rate consent. True when this withdrew it, so stored heart rate must go.</summary>
    public bool SetHeartRateConsent(bool consent, DateTimeOffset at)
    {
        var withdrawn = HeartRateConsent && !consent;
        if (consent != HeartRateConsent || HeartRateConsentChangedAt is null)
        {
            HeartRateConsent = consent;
            HeartRateConsentChangedAt = at;
        }

        return withdrawn;
    }

    public void UpdateProfile(string? email, string displayName, string timeZone, Units units, bool weeklyEmails, int? maxHeartRate = null)
    {
        if (maxHeartRate is < HeartRateZones.LowestMaxHeartRate or > HeartRateZones.HighestMaxHeartRate)
        {
            throw new DomainException($"A max heart rate is between {HeartRateZones.LowestMaxHeartRate} and {HeartRateZones.HighestMaxHeartRate} beats a minute.");
        }

        if (string.IsNullOrWhiteSpace(displayName) || displayName.Trim().Length > MaxNameLength)
        {
            throw new DomainException($"A display name is required and can be at most {MaxNameLength} characters.");
        }

        if (string.IsNullOrWhiteSpace(timeZone) || timeZone.Length > MaxTimeZoneLength)
        {
            throw new DomainException("A time zone is required.");
        }

        if (email is { Length: > MaxEmailLength })
        {
            throw new DomainException("That email address is too long.");
        }

        Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        DisplayName = displayName.Trim();
        TimeZone = timeZone;
        Units = units;
        WeeklyEmails = weeklyEmails;
        MaxHeartRate = maxHeartRate;
    }
}
