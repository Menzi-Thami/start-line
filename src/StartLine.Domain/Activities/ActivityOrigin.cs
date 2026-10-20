using System.Globalization;

namespace StartLine.Domain.Activities;

public enum ActivitySource
{
    /// <summary>A file the runner uploaded. Theirs, and kept until they delete it.</summary>
    Upload,

    /// <summary>Synced from Strava. A cache that lapses unless it's fetched again (Strava API Policy 6.2).</summary>
    Strava,
}

/// <summary>
/// Where a run came from. Uploads are kept until the runner deletes them. A synced run is only ever a short-lived
/// copy: <see cref="CachedUntil"/> is when it must be fetched again or dropped.
/// </summary>
public sealed record ActivityOrigin(ActivitySource Source, string? ExternalId, DateTimeOffset? CachedUntil, bool RecordedOnGarmin)
{
    public const int MaxExternalIdLength = 32;

    public static readonly ActivityOrigin Upload = new(ActivitySource.Upload, null, null, false);

    /// <param name="fetchedAt">When the run was read from Strava: the cache runs for <see cref="StravaCache.Lifetime"/> from then.</param>
    /// <param name="recordedOnGarmin">Strava's policy wants Garmin credited for runs a Garmin device recorded.</param>
    public static ActivityOrigin Strava(long activityId, DateTimeOffset fetchedAt, bool recordedOnGarmin) =>
        activityId <= 0
            ? throw new Common.DomainException("A Strava run needs its Strava id.")
            : new(ActivitySource.Strava, activityId.ToString(CultureInfo.InvariantCulture), fetchedAt.ToUniversalTime() + StravaCache.Lifetime, recordedOnGarmin);
}

/// <summary>How long a run synced from Strava may be kept, and when to fetch it again so it doesn't lapse.</summary>
public static class StravaCache
{
    /// <summary>Strava API Policy 6.2: "You may not retain Strava Data in your cache for longer than seven (7) days."</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    /// <summary>Fetch again once less than this is left, so a missed day (the free plan sleeps) still leaves room.</summary>
    public static readonly TimeSpan RefreshWithin = TimeSpan.FromDays(3);

    /// <summary>How far back a new connection reaches: enough for the trend and volume charts.</summary>
    public static readonly TimeSpan Backfill = TimeSpan.FromDays(42);

    /// <summary>True when a cached run has lapsed and must not be shown or kept.</summary>
    public static bool HasLapsed(DateTimeOffset? cachedUntil, DateTimeOffset now) => cachedUntil is { } until && until <= now;

    public static bool IsDueForRefresh(DateTimeOffset? cachedUntil, DateTimeOffset now) => cachedUntil is { } until && until - now < RefreshWithin;
}
