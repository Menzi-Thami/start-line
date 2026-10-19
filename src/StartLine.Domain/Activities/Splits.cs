namespace StartLine.Domain.Activities;

/// <summary>One kilometre of a run (the last one may be shorter). Time is moving time: a stop at the lights doesn't count.</summary>
public sealed record Split(int Number, double DistanceMetres, TimeSpan MovingTime, double? ElevationChangeMetres, int? AverageHeartRate)
{
    public double PaceSecondsPerKm => MovingTime.TotalSeconds / (DistanceMetres / 1000);

    public bool IsFullKilometre => DistanceMetres >= Splits.FullKilometreMetres;
}

public static class Splits
{
    /// <summary>A last bit shorter than this is GPS noise after the watch stopped, not a split.</summary>
    public const double ShortestTailMetres = 10;

    /// <summary>Close enough to 1 km to rank against the others; float rounding can leave a split at 999.99 m.</summary>
    public const double FullKilometreMetres = 999;

    internal static IReadOnlyList<Split> ByKilometre(Track track)
    {
        List<Split> splits = [];
        for (var from = 0d; track.TotalMetres - from >= ShortestTailMetres; from += 1000)
        {
            var to = Math.Min(from + 1000, track.TotalMetres);
            var moving = track.MovingSecondsAt(to) - track.MovingSecondsAt(from);
            if (moving <= 0)
            {
                // Distance crept up while "standing still" (a slow GPS drift): wall-clock time is all there is.
                moving = track.FirstElapsedAt(to) - track.FirstElapsedAt(from);
            }

            var climb = track.AltitudeAt(to) - track.AltitudeAt(from);
            splits.Add(new Split(
                splits.Count + 1,
                to - from,
                TimeSpan.FromSeconds(moving),
                climb is { } metres ? Math.Round(metres, 1) : null,
                track.AverageHeartRateBetween(from, to)));
        }

        return splits;
    }

    /// <summary>The fastest full kilometre, or null when there are fewer than two to compare.</summary>
    public static Split? Quickest(IReadOnlyList<Split> splits) => Ranked(splits)?.First();

    /// <summary>The slowest full kilometre: usually the hilliest or the most tired. Null when there are fewer than two.</summary>
    public static Split? Hardest(IReadOnlyList<Split> splits) => Ranked(splits)?.Last();

    private static List<Split>? Ranked(IReadOnlyList<Split> splits)
    {
        ArgumentNullException.ThrowIfNull(splits);
        var full = splits.Where(s => s.IsFullKilometre && s.MovingTime > TimeSpan.Zero)
            .OrderBy(s => s.PaceSecondsPerKm)
            .ThenBy(s => s.Number)
            .ToList();
        return full.Count < 2 ? null : full;
    }
}
