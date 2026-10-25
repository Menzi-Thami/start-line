namespace StartLine.Application.Common;

internal static class TimeProviderExtensions
{
    public static DateOnly Today(this TimeProvider timeProvider) =>
        DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);

    /// <summary>A runner's time zone: their IANA zone, or UTC when it isn't one this server knows.</summary>
    public static TimeZoneInfo ZoneOf(string timeZone) =>
        TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out var zone) ? zone : TimeZoneInfo.Utc;

    /// <summary>The time now on the runner's own clock.</summary>
    public static DateTime LocalNow(this TimeProvider timeProvider, TimeZoneInfo zone) =>
        TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), zone).DateTime;

    /// <summary>
    /// A time on the runner's own clock as an instant. A time the clocks skip when they go forward is taken an hour on;
    /// one they pass twice when they go back, the later time.
    /// </summary>
    public static DateTimeOffset FromLocal(DateTime local, TimeZoneInfo zone)
    {
        ArgumentNullException.ThrowIfNull(zone);
        var unspecified = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        if (zone.IsInvalidTime(unspecified))
        {
            unspecified = unspecified.AddHours(1);
        }

        return new DateTimeOffset(unspecified, zone.GetUtcOffset(unspecified));
    }
}
