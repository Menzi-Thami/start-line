namespace StartLine.Domain.Running;

/// <summary>
/// Riegel's endurance model: T2 = T1 × (D2 / D1)^1.06. Good between roughly 5K and the marathon;
/// it gets optimistic for ultras, where terrain and fuelling matter more than the curve.
/// </summary>
public static class RaceTimePredictor
{
    public const double FatigueExponent = 1.06;

    public static TimeSpan Predict(Distance from, TimeSpan time, Distance to)
    {
        ArgumentNullException.ThrowIfNull(from);
        ArgumentNullException.ThrowIfNull(to);

        var ratio = to.Kilometres / from.Kilometres;
        return TimeSpan.FromSeconds(time.TotalSeconds * Math.Pow(ratio, FatigueExponent));
    }

    public static Pace EquivalentPace(Distance from, TimeSpan time, Distance to) =>
        Pace.Of(to, Predict(from, time, to));
}
