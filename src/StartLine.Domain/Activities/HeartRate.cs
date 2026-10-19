namespace StartLine.Domain.Activities;

/// <summary>Moving time spent at one heart rate. A run keeps these rather than zones, so zones follow the runner's max heart rate when they set or change it.</summary>
public sealed record HeartRateTime(int Bpm, double Seconds);

/// <summary>Time in one heart-rate zone, from <see cref="FromPercent"/> up to (not including) <see cref="ToPercent"/> of max.</summary>
public sealed record HeartRateZoneTime(int Zone, int FromPercent, int ToPercent, int FromBpm, int ToBpm, double Seconds);

/// <summary>
/// The common five zones as a share of max heart rate. A training guide, not a medical measure: max heart rate
/// varies a lot between people, so zones are only shown once the runner has told Taperday theirs.
/// </summary>
public static class HeartRateZones
{
    public const int LowestMaxHeartRate = 120;
    public const int HighestMaxHeartRate = 230;

    /// <summary>Running a steady run with pace per beat dropping more than this from first half to second is worth a mention.</summary>
    public const double NotableDriftPercent = 5;

    private static readonly int[] Bounds = [50, 60, 70, 80, 90, 101];

    public static IReadOnlyList<HeartRateZoneTime> TimeIn(IReadOnlyList<HeartRateTime> time, int maxHeartRate)
    {
        ArgumentNullException.ThrowIfNull(time);
        return [.. Enumerable.Range(0, Bounds.Length - 1).Select(z =>
        {
            var from = (int)Math.Round(maxHeartRate * Bounds[z] / 100.0);
            var to = (int)Math.Round(maxHeartRate * Bounds[z + 1] / 100.0);
            // Anything below zone 1 counts as zone 1, and anything above max as zone 5.
            var seconds = time
                .Where(t => (z == 0 || t.Bpm >= from) && (z == Bounds.Length - 2 || t.Bpm < to))
                .Sum(t => t.Seconds);
            return new HeartRateZoneTime(z + 1, Bounds[z], Math.Min(Bounds[z + 1], 100), from, Math.Min(to, maxHeartRate), Math.Round(seconds));
        })];
    }
}
