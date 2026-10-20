namespace StartLine.Domain.Sync;

/// <summary>
/// How much of a provider's rate limit the app has used, as the provider last reported it. Strava sends a
/// 15-minute and a daily figure for every app (not per runner), so one runner's backfill spends everyone's budget.
/// </summary>
public sealed record ApiUsage(int ShortTermUsed, int ShortTermLimit, int DailyUsed, int DailyLimit);

/// <summary>When calls may resume. Strava's windows reset on the quarter hour and at midnight UTC.</summary>
public static class RateLimit
{
    /// <summary>Stop at 90%: the rest is kept for runners connecting or disconnecting, which can't wait.</summary>
    public const double Headroom = 0.9;

    public static readonly TimeSpan ShortTermWindow = TimeSpan.FromMinutes(15);

    /// <summary>When background work may call again, or null if there's budget left now.</summary>
    public static DateTimeOffset? BlockedUntil(ApiUsage usage, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(usage);
        if (usage.DailyLimit > 0 && usage.DailyUsed >= usage.DailyLimit * Headroom)
        {
            return NextUtcMidnight(now);
        }

        if (usage.ShortTermLimit > 0 && usage.ShortTermUsed >= usage.ShortTermLimit * Headroom)
        {
            return NextQuarterHour(now);
        }

        return null;
    }

    public static DateTimeOffset NextQuarterHour(DateTimeOffset now)
    {
        var utc = now.ToUniversalTime();
        var hour = new DateTimeOffset(utc.Year, utc.Month, utc.Day, utc.Hour, 0, 0, TimeSpan.Zero);
        var quarters = (int)((utc - hour).Ticks / ShortTermWindow.Ticks) + 1;
        return hour + (ShortTermWindow * quarters);
    }

    public static DateTimeOffset NextUtcMidnight(DateTimeOffset now)
    {
        var utc = now.ToUniversalTime();
        return new DateTimeOffset(utc.Year, utc.Month, utc.Day, 0, 0, 0, TimeSpan.Zero).AddDays(1);
    }
}
