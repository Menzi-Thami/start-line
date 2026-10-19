namespace StartLine.Domain.Activities;

public sealed record StandardDistance(string Name, double Metres)
{
    public static readonly IReadOnlyList<StandardDistance> All =
    [
        new("400 m", 400),
        new("½ mile", 804.672),
        new("1K", 1000),
        new("1 mile", 1609.344),
        new("2 mile", 3218.688),
        new("5K", 5000),
        new("10K", 10_000),
        new("15K", 15_000),
        new("10 mile", 16_093.44),
        new("20K", 20_000),
        new("Half marathon", 21_097.5),
        new("30K", 30_000),
        new("Marathon", 42_195),
    ];

    public static StandardDistance? Find(double metres) => All.FirstOrDefault(d => Math.Abs(d.Metres - metres) < 0.5);
}

/// <summary>
/// The fastest stretch of a standard distance anywhere in a run. Wall-clock time, like a race: stopping during
/// the stretch counts against it. So a fast 5K inside a long run counts, and so does a parkrun with a warm-up.
/// </summary>
public sealed record BestEffort(double DistanceMetres, TimeSpan Elapsed)
{
    public double PaceSecondsPerKm => Elapsed.TotalSeconds / (DistanceMetres / 1000);
}

public static class BestEfforts
{
    internal static IReadOnlyList<BestEffort> Find(Track track) =>
        [.. StandardDistance.All
            .Select(d => (d.Metres, Seconds: track.FastestElapsedOver(d.Metres)))
            .Where(e => e.Seconds is > 0)
            .Select(e => new BestEffort(e.Metres, TimeSpan.FromSeconds(e.Seconds!.Value)))];

    /// <summary>
    /// Whether this effort is the runner's fastest for its distance, given their best time across every stored run
    /// (this one included). Ties count: matching your best is still your best.
    /// </summary>
    public static bool IsPersonalBest(BestEffort effort, IReadOnlyDictionary<double, TimeSpan> fastestByDistance)
    {
        ArgumentNullException.ThrowIfNull(effort);
        ArgumentNullException.ThrowIfNull(fastestByDistance);
        return !fastestByDistance.TryGetValue(effort.DistanceMetres, out var fastest) || effort.Elapsed <= fastest;
    }
}
