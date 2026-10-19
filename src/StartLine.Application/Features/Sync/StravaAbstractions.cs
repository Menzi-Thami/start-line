using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Sync;

/// <summary>
/// Strava's API, as much of it as Taperday uses. Implemented over HTTP in Infrastructure; tests use a fake, so no test
/// ever needs Strava credentials. Every call that reads runner data takes that runner's own access token.
/// </summary>
public interface IStravaApi
{
    /// <summary>Strava's largest page of activities: a shorter page is the last one.</summary>
    public const int PageSize = 100;

    /// <summary>Strava's authorize page for this runner, carrying <paramref name="state"/> back to the callback.</summary>
    Uri AuthorizeUrl(string state, Uri redirectUri);

    Task<StravaTokenGrant> ExchangeCodeAsync(string code, CancellationToken cancellationToken);

    Task<StravaTokenGrant> RefreshAsync(string refreshToken, CancellationToken cancellationToken);

    /// <summary>Revokes Taperday's access for this runner at Strava.</summary>
    Task DeauthorizeAsync(string accessToken, CancellationToken cancellationToken);

    /// <summary>The runner's activities started after <paramref name="after"/>, oldest first, one page at a time.</summary>
    Task<IReadOnlyList<StravaActivitySummary>> ListActivitiesAsync(string accessToken, DateTimeOffset after, int page, CancellationToken cancellationToken);

    /// <summary>One activity, or null when Strava says it's gone or no longer visible to Taperday.</summary>
    Task<StravaActivity?> GetActivityAsync(string accessToken, long activityId, CancellationToken cancellationToken);

    /// <summary>Time, distance, altitude and heart rate streams. Never location. Null when the activity has none (a manual entry).</summary>
    Task<StravaStreams?> GetStreamsAsync(string accessToken, long activityId, CancellationToken cancellationToken);
}

/// <summary>Strava's token response. <see cref="AthleteId"/> comes with the first exchange only.</summary>
public sealed record StravaTokenGrant(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, long? AthleteId);

public sealed record StravaActivitySummary(long Id, string SportType, DateTimeOffset StartDate);

public sealed record StravaActivity(
    long Id,
    long AthleteId,
    string SportType,
    DateTimeOffset StartDate,
    bool Trainer,
    bool Manual,
    double? TotalElevationGain,
    double? AverageHeartRate,
    double? MaxHeartRate,
    double? Calories,
    string? DeviceName);

/// <summary>Index-aligned samples: point i is <c>Time[i]</c> seconds from the start, <c>Distance[i]</c> metres along.</summary>
public sealed record StravaStreams(
    IReadOnlyList<int> Time,
    IReadOnlyList<double> Distance,
    IReadOnlyList<double>? Altitude,
    IReadOnlyList<int>? HeartRate);

/// <summary>Strava refused the token: revoked by the runner, or a refresh token that no longer works.</summary>
#pragma warning disable CA1032 // Carries required data.
public sealed class StravaUnauthorizedException(string message) : Exception(message);

/// <summary>Out of rate limit (Taperday's own headroom or Strava's 429). Background work waits until <see cref="RetryAt"/>.</summary>
public sealed class StravaRateLimitedException(DateTimeOffset retryAt)
    : Exception($"Strava's rate limit is used up until {retryAt:u}.")
{
    public DateTimeOffset RetryAt { get; } = retryAt;
}

/// <summary>Strava is down or answered with something unreadable. Worth retrying later.</summary>
public sealed class StravaUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
#pragma warning restore CA1032

/// <summary>Strava settings the application needs. Secrets stay in configuration; never in code or the repo.</summary>
public interface IStravaSettings
{
    /// <summary>False until the Strava app's client id and secret are configured: the feature then stays hidden.</summary>
    bool IsEnabled { get; }

    /// <summary>Where Strava sends the runner back after they approve: the web app's callback page.</summary>
    Uri RedirectUri { get; }

    /// <summary>The push subscription Taperday created. Events for any other subscription are ignored.</summary>
    long? SubscriptionId { get; }

    /// <summary>The token Strava echoes when it validates the callback while the subscription is created.</summary>
    string VerifyToken { get; }

    /// <summary>The unguessable last segment of the webhook path, so random traffic never reaches the handler.</summary>
    string HookSecret { get; }
}

/// <summary>Encrypts tokens before they're stored. Data Protection in Infrastructure, keys wrapped by Key Vault.</summary>
public interface ITokenProtector
{
    string Protect(string token);

    string Unprotect(string protectedToken);
}

/// <summary>
/// The OAuth <c>state</c>: names the runner who started connecting, can't be forged and expires in minutes, so a
/// callback can't attach someone else's Strava to an account.
/// </summary>
public interface IConnectState
{
    string Issue(Guid runnerId);

    /// <summary>The runner the state was issued for. Throws a validation error if it was tampered with or expired.</summary>
    Guid Read(string state);
}

/// <summary>Wakes the sync worker when there's new work, so it never needs to poll the database.</summary>
public interface ISyncSignal
{
    void Wake();
}

/// <summary>
/// Remembers the latest rate-limit figures Strava reported (per app, so shared by everyone) and says when background
/// calls must wait.
/// </summary>
public sealed class StravaRateGate(TimeProvider time)
{
    private readonly Lock gate = new();
    private ApiUsage? usage;
    private DateTimeOffset? blockedUntil;

    public void Record(ApiUsage reported)
    {
        lock (gate)
        {
            usage = reported;
            blockedUntil = RateLimit.BlockedUntil(reported, time.GetUtcNow());
        }
    }

    /// <summary>Strava answered 429: wait for the next window whatever the headers said. Returns when calls may resume.</summary>
    public DateTimeOffset RecordRejected()
    {
        var now = time.GetUtcNow();
        lock (gate)
        {
            var daily = usage is { DailyLimit: > 0 } u && u.DailyUsed >= u.DailyLimit;
            var until = daily ? RateLimit.NextUtcMidnight(now) : RateLimit.NextQuarterHour(now);
            blockedUntil = until;
            return until;
        }
    }

    /// <summary>When background work may call again, or null when it may call now.</summary>
    public DateTimeOffset? BlockedUntil()
    {
        lock (gate)
        {
            return blockedUntil is { } until && until > time.GetUtcNow() ? until : null;
        }
    }

    public ApiUsage? LastUsage
    {
        get
        {
            lock (gate)
            {
                return usage;
            }
        }
    }
}
