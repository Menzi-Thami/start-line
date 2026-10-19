using StartLine.Domain.Activities;

namespace StartLine.Domain.Tests.Activities;

/// <summary>Builds a 1 Hz recording the way a watch would, one stretch at a time.</summary>
internal sealed class RunBuilder
{
    public static readonly DateTimeOffset Start = new(2026, 10, 18, 4, 30, 0, TimeSpan.Zero);

    private readonly List<ActivitySample> samples = [new(TimeSpan.Zero, 0, 100, 140)];
    private ActivityKind kind = ActivityKind.Run;
    private DeviceTotals device = DeviceTotals.None;

    private ActivitySample Last => samples[^1];

    /// <summary>Runs <paramref name="metres"/> at a steady pace, climbing <paramref name="climbMetres"/> evenly.</summary>
    public RunBuilder Run(double metres, double secondsPerKm, double climbMetres = 0, int heartRate = 150)
    {
        var seconds = (int)Math.Round(metres / 1000 * secondsPerKm);
        var at = Last;
        for (var s = 1; s <= seconds; s++)
        {
            var fraction = (double)s / seconds;
            samples.Add(new ActivitySample(
                at.Elapsed + TimeSpan.FromSeconds(s),
                at.DistanceMetres + (metres * fraction),
                at.AltitudeMetres + (climbMetres * fraction),
                heartRate));
        }

        return this;
    }

    /// <summary>Stands still, still recording, as at a traffic light.</summary>
    public RunBuilder Stand(int seconds)
    {
        var at = Last;
        for (var s = 1; s <= seconds; s++)
        {
            samples.Add(at with { Elapsed = at.Elapsed + TimeSpan.FromSeconds(s) });
        }

        return this;
    }

    public RunBuilder Add(ActivitySample sample)
    {
        samples.Add(sample);
        return this;
    }

    public RunBuilder Kind(ActivityKind value)
    {
        kind = value;
        return this;
    }

    public RunBuilder Device(DeviceTotals value)
    {
        device = value;
        return this;
    }

    public ActivityRecording Build() => new(Start, kind, samples, device);

    public Activity Record(params PlannedSessionMatch[] planned) =>
        Activity.Record(Guid.NewGuid(), Build(), DateOnly.FromDateTime(Start.UtcDateTime), planned);
}
