namespace StartLine.Application.Common;

/// <summary>
/// Sanity bounds for a goal or result time: nothing faster than the world record for the distance (a typo, or a time
/// no one has run), and nothing slower than a brisk walk. The client uses the same table (goal-limits.ts) so the
/// builder blocks the goal step before the request is ever sent.
/// </summary>
internal static class GoalTimeRules
{
    public const double SlowestSecondsPerKm = 900;

    /// <summary>
    /// The fastest time ever run at each distance, in seconds (track where it beats the road), as at November 2026:
    /// mile 3:43.13, 3000 m 7:17.55, 5000 m 12:35.36, 10,000 m 26:11.00, half marathon 57:30, marathon 2:00:35,
    /// 50 km 2:40:13, 100 km 6:05:35.
    /// </summary>
    private static readonly (double Km, double Seconds)[] Records =
    [
        (1.609344, 223.13),
        (3, 437.55),
        (5, 755.36),
        (10, 1571),
        (21.0975, 3450),
        (42.195, 7235),
        (50, 9613),
        (100, 21935),
    ];

    /// <summary>The world-record time for a distance, interpolated on a log-log scale between the records above.</summary>
    public static double WorldRecordSeconds(double distanceKm)
    {
        var first = Records[0];
        if (distanceKm <= first.Km)
        {
            return first.Seconds * distanceKm / first.Km;
        }

        for (var i = 1; i < Records.Length; i++)
        {
            var (km, seconds) = Records[i];
            if (distanceKm <= km)
            {
                var (fromKm, fromSeconds) = Records[i - 1];
                return Interpolate(fromKm, fromSeconds, km, seconds, distanceKm);
            }
        }

        // Beyond 100 km, keep slowing at the rate between 50 and 100 km.
        var (lastFromKm, lastFromSeconds) = Records[^2];
        var (lastKm, lastSeconds) = Records[^1];
        return Interpolate(lastFromKm, lastFromSeconds, lastKm, lastSeconds, distanceKm);
    }

    private static double Interpolate(double fromKm, double fromSeconds, double toKm, double toSeconds, double km)
    {
        var exponent = Math.Log(toSeconds / fromSeconds) / Math.Log(toKm / fromKm);
        return fromSeconds * Math.Pow(km / fromKm, exponent);
    }

    public static bool IsPlausible(double distanceKm, TimeSpan time)
    {
        if (distanceKm <= 0 || time <= TimeSpan.Zero)
        {
            return false;
        }

        return time.TotalSeconds >= WorldRecordSeconds(distanceKm) && time.TotalSeconds / distanceKm <= SlowestSecondsPerKm;
    }

    public const string Message = "That time is faster than the world record or slower than walking pace for this distance. Check the hours, minutes and seconds.";
}
