namespace StartLine.Domain.Activities;

/// <summary>How two recorded runs relate: the same run recorded twice, two runs that overlap in time, or unrelated.</summary>
public enum RunRelation
{
    Unrelated,

    /// <summary>Started within <see cref="RunMatch.SameStartWithin"/> and the distances agree: one run, recorded or imported twice.</summary>
    SameRun,

    /// <summary>The two runs' times overlap but they don't agree well enough to be called the same run. The runner decides.</summary>
    Overlapping,
}

/// <summary>
/// Tells duplicates apart. Watches, file formats and Strava disagree by a few seconds on when a run started (a FIT
/// session's start, a GPX file's first point, Strava's start date), so an exact start time misses real duplicates.
/// </summary>
public static class RunMatch
{
    /// <summary>Starts this close are the same moment, give or take a GPS fix or a paused watch.</summary>
    public static readonly TimeSpan SameStartWithin = TimeSpan.FromMinutes(2);

    /// <summary>Distances this close (a share of the longer one) are the same run measured twice.</summary>
    public const double DistanceTolerance = 0.03;

    /// <summary>Short runs can differ by a GPS wobble more than 3%: always allow this much.</summary>
    public const double DistanceSlackMetres = 150;

    public static RunRelation Compare(Activity first, Activity second)
    {
        ArgumentNullException.ThrowIfNull(first);
        ArgumentNullException.ThrowIfNull(second);
        return Compare(first.StartedAt, first.ElapsedTime, first.DistanceMetres, second.StartedAt, second.ElapsedTime, second.DistanceMetres);
    }

    public static RunRelation Compare(
        DateTimeOffset firstStart, TimeSpan firstElapsed, double firstMetres, DateTimeOffset secondStart, TimeSpan secondElapsed, double secondMetres)
    {
        if (IsSameRun(firstStart, firstMetres, secondStart, secondMetres))
        {
            return RunRelation.SameRun;
        }

        var overlap = firstStart < secondStart + secondElapsed && secondStart < firstStart + firstElapsed;
        return overlap ? RunRelation.Overlapping : RunRelation.Unrelated;
    }

    public static bool IsSameRun(DateTimeOffset firstStart, double firstMetres, DateTimeOffset secondStart, double secondMetres)
    {
        var apart = (firstStart - secondStart).Duration();
        var longer = Math.Max(firstMetres, secondMetres);
        return apart <= SameStartWithin && Math.Abs(firstMetres - secondMetres) <= Math.Max(longer * DistanceTolerance, DistanceSlackMetres);
    }
}
