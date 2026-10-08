namespace StartLine.Application.Common;

/// <summary>Sanity bounds that catch typos (a marathon in 3 minutes, a 5K in 30 hours) before they reach the maths.</summary>
internal static class GoalTimeRules
{
    // Just quicker than the 5K world record, and a brisk walk.
    public const double FastestSecondsPerKm = 150;
    public const double SlowestSecondsPerKm = 900;

    public static bool IsPlausible(double distanceKm, TimeSpan time)
    {
        if (distanceKm <= 0 || time <= TimeSpan.Zero)
        {
            return false;
        }

        var secondsPerKm = time.TotalSeconds / distanceKm;
        return secondsPerKm is >= FastestSecondsPerKm and <= SlowestSecondsPerKm;
    }

    public const string Message = "That time works out to an unrealistic pace for this distance. Check the hours, minutes and seconds.";
}
