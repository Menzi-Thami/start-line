namespace StartLine.Application.Features.Sync;

/// <summary>Why a run fetched from Strava wasn't kept, in words the runner sees.</summary>
public static class SkipReasons
{
    public const string AlreadyUploaded = "You uploaded this run's file already, so the upload is kept instead.";

    public const string LimitReached = "You've reached the run limit. Delete an old run to make room.";

    public const string MissingRecording = "Strava did not share usable time and distance recording samples for this run. Upload its recording file, or log the time and distance you know in your training plan.";

    public const string ManualEntry = "This is a manually entered Strava activity, not a recording. Log the time and distance you know in your training plan instead.";
}
