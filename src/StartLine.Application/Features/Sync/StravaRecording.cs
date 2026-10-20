using StartLine.Domain.Activities;

namespace StartLine.Application.Features.Sync;

/// <summary>
/// Turns a Strava activity and its streams into the same <see cref="ActivityRecording"/> a .FIT upload gives, so a
/// synced run gets exactly the analysis and plan matching an uploaded one does.
/// </summary>
public static class StravaRecording
{
    /// <summary>Strava's run types and what Taperday calls them. Everything else (rides, walks, hikes) is skipped.</summary>
    public static ActivityKind KindOf(string sportType, bool trainer) => sportType switch
    {
        "Run" => trainer ? ActivityKind.TreadmillRun : ActivityKind.Run,
        "TrailRun" => ActivityKind.TrailRun,
        "VirtualRun" => ActivityKind.TreadmillRun,
        _ => ActivityKind.Other,
    };

    public static bool IsRun(string sportType) => KindOf(sportType, trainer: false) != ActivityKind.Other;

    /// <summary>Strava names the device in <c>device_name</c>, e.g. "Garmin Forerunner 265".</summary>
    public static bool RecordedOnGarmin(StravaActivity activity)
    {
        ArgumentNullException.ThrowIfNull(activity);
        return activity.DeviceName?.Contains("Garmin", StringComparison.OrdinalIgnoreCase) == true;
    }

    /// <summary>The recording, or null when there's nothing to analyse: not a run, a manual entry, or no distance stream.</summary>
    public static ActivityRecording? From(StravaActivity activity, StravaStreams? streams)
    {
        ArgumentNullException.ThrowIfNull(activity);
        var kind = KindOf(activity.SportType, activity.Trainer);
        if (kind == ActivityKind.Other || activity.Manual || streams is null || streams.Time.Count < 2 || streams.Distance.Count != streams.Time.Count)
        {
            return null;
        }

        var samples = new List<ActivitySample>(streams.Time.Count);
        for (var i = 0; i < streams.Time.Count; i++)
        {
            samples.Add(new ActivitySample(
                TimeSpan.FromSeconds(streams.Time[i]),
                streams.Distance[i],
                Aligned(streams.Altitude, i, streams.Time.Count),
                Aligned(streams.HeartRate, i, streams.Time.Count) is { } bpm && bpm > 0 ? bpm : null));
        }

        return new ActivityRecording(
            activity.StartDate.ToUniversalTime(),
            kind,
            samples,
            new DeviceTotals(
                activity.TotalElevationGain,
                activity.Calories is { } kcal && kcal > 0 ? (int)Math.Round(kcal) : null,
                activity.AverageHeartRate is { } avg && avg > 0 ? (int)Math.Round(avg) : null,
                activity.MaxHeartRate is { } max && max > 0 ? (int)Math.Round(max) : null));
    }

    // A stream that doesn't line up with time is ignored entirely rather than misread.
    private static double? Aligned(IReadOnlyList<double>? stream, int i, int count) => stream is { } s && s.Count == count ? s[i] : null;

    private static int? Aligned(IReadOnlyList<int>? stream, int i, int count) => stream is { } s && s.Count == count ? s[i] : null;
}
