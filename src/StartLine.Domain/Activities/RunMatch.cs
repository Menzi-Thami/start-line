namespace StartLine.Domain.Activities;

/// <summary>
/// Tells when two recordings are one run, so Taperday keeps one and never asks the runner to sort duplicates out.
/// Watches, phones, file formats and Strava disagree by a few seconds on when a run started and, with GPS, by more than a
/// little on how far it went. So a run recorded twice (a watch and a phone, a FIT file and its GPX export, a file and its
/// Strava copy) is one that started within <see cref="SameStartWithin"/> and either agrees on the distance or overlaps
/// the other recording almost entirely.
/// </summary>
public static class RunMatch
{
    /// <summary>Starts this close are the same moment, give or take a GPS fix or a paused watch.</summary>
    public static readonly TimeSpan SameStartWithin = TimeSpan.FromMinutes(2);

    /// <summary>Distances this close (a share of the longer one) are the same run measured twice.</summary>
    public const double DistanceTolerance = 0.03;

    /// <summary>Short runs can differ by a GPS wobble more than 3%: always allow this much.</summary>
    public const double DistanceSlackMetres = 150;

    /// <summary>
    /// The share of the longer recording the two must overlap when two devices recorded the same run. Measured against the
    /// longer one, so a few minutes started by accident inside a long run is never taken for the run itself.
    /// </summary>
    public const double OverlapShare = 0.8;

    public static bool IsSameRun(Activity first, Activity second)
    {
        ArgumentNullException.ThrowIfNull(first);
        ArgumentNullException.ThrowIfNull(second);
        return IsSameRun(first.StartedAt, first.ElapsedTime, first.DistanceMetres, second.StartedAt, second.ElapsedTime, second.DistanceMetres);
    }

    public static bool IsSameRun(
        DateTimeOffset firstStart, TimeSpan firstElapsed, double firstMetres, DateTimeOffset secondStart, TimeSpan secondElapsed, double secondMetres)
    {
        if ((firstStart - secondStart).Duration() > SameStartWithin)
        {
            return false;
        }

        var longer = Math.Max(firstMetres, secondMetres);
        if (Math.Abs(firstMetres - secondMetres) <= Math.Max(longer * DistanceTolerance, DistanceSlackMetres))
        {
            return true;
        }

        var overlap = Min(firstStart + firstElapsed, secondStart + secondElapsed) - Max(firstStart, secondStart);
        var longerTime = firstElapsed > secondElapsed ? firstElapsed : secondElapsed;
        return longerTime > TimeSpan.Zero && overlap.TotalSeconds >= longerTime.TotalSeconds * OverlapShare;
    }

    /// <summary>
    /// True when <paramref name="candidate"/> is the better recording of the same run to keep than <paramref name="kept"/>:
    /// the runner's own upload beats a synced copy; otherwise the one that measured more (heart rate, splits, elevation).
    /// A tie keeps what's already there.
    /// </summary>
    public static bool IsBetterRecording(Activity candidate, Activity kept)
    {
        ArgumentNullException.ThrowIfNull(candidate);
        ArgumentNullException.ThrowIfNull(kept);
        if (candidate.Source != kept.Source)
        {
            return candidate.Source == ActivitySource.Upload;
        }

        return Richness(candidate) > Richness(kept);
    }

    private static int Richness(Activity run) =>
        (run.AverageHeartRate is null ? 0 : 2) + (run.Splits.Count > 0 ? 1 : 0) + (run.ElevationGainMetres is null ? 0 : 1);

    private static DateTimeOffset Min(DateTimeOffset a, DateTimeOffset b) => a < b ? a : b;

    private static DateTimeOffset Max(DateTimeOffset a, DateTimeOffset b) => a > b ? a : b;
}
