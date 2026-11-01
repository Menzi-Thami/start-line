namespace StartLine.Application.Features.Sync;

/// <summary>Why a run fetched from Strava wasn't kept, in words the runner sees.</summary>
public static class SkipReasons
{
    public const string AlreadyUploaded = "You uploaded this run's file already, so the upload is kept instead.";

    public const string LimitReached = "You've reached the run limit. Delete an old run to make room.";
}
