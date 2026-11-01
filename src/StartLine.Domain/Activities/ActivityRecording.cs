namespace StartLine.Domain.Activities;

/// <summary>The kind of file an uploaded run was read from. Synced runs have none: they come from the provider's API.</summary>
public enum RecordingFormat
{
    Fit,
    Gpx,
    Tcx,
}

public enum ActivityKind
{
    Run,
    TrailRun,
    TreadmillRun,

    /// <summary>Anything that isn't a run: rides, swims, walks. Taperday doesn't import these.</summary>
    Other,
}

/// <summary>One point of a recording: how long since the start (wall clock, pauses included) and how far so far.</summary>
public sealed record ActivitySample(TimeSpan Elapsed, double DistanceMetres, double? AltitudeMetres = null, int? HeartRate = null);

/// <summary>Totals the watch worked out itself. Preferred over ours when present: barometric ascent beats GPS altitude.</summary>
public sealed record DeviceTotals(double? AscentMetres = null, int? Calories = null, int? AverageHeartRate = null, int? MaxHeartRate = null)
{
    public static readonly DeviceTotals None = new();
}

/// <summary>
/// A run as a watch recorded it, already decoded from whatever file format it came in. No GPS positions:
/// Taperday never needs where someone ran, only how far and how fast.
/// </summary>
public sealed record ActivityRecording(
    DateTimeOffset StartedAt,
    ActivityKind Kind,
    IReadOnlyList<ActivitySample> Samples,
    DeviceTotals Device)
{
    /// <summary>The file format it was read from, kept so the runner can see where each run came from.</summary>
    public RecordingFormat? Format { get; init; }

    /// <summary>The same run with every heart-rate reading taken out, for a runner who hasn't agreed to Taperday keeping it.</summary>
    public ActivityRecording WithoutHeartRate() => this with
    {
        Samples = [.. Samples.Select(s => s with { HeartRate = null })],
        Device = Device with { AverageHeartRate = null, MaxHeartRate = null },
    };
}
