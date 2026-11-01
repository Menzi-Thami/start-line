using StartLine.Domain.Common;

namespace StartLine.Domain.Sync;

public enum SyncJobKind
{
    /// <summary>Read one run (new, edited, or due a refresh) and record it.</summary>
    FetchActivity,

    /// <summary>The runner deleted a run at the provider, or made it private beyond what they granted.</summary>
    DeleteActivity,

    /// <summary>The runner revoked access at the provider: delete everything synced from it.</summary>
    Deauthorize,

    /// <summary>First connection: list recent runs and fetch each.</summary>
    Backfill,

    /// <summary>The app was opened: list anything since the last sync, in case a push was missed while it slept.</summary>
    CatchUp,

    /// <summary>Daily: fetch again the synced runs whose cache would otherwise lapse, and drop the ones that have.</summary>
    Refresh,
}

/// <summary>Lower runs first. A run that just finished matters more than keeping last month's cache warm.</summary>
public enum SyncPriority
{
    Live = 0,
    Delete = 1,
    CatchUp = 2,
    Backfill = 3,
    Refresh = 4,
}

/// <summary>
/// One piece of sync work, kept in the database so it survives the app sleeping or restarting. Webhook handlers only
/// write these; the worker does the provider calls, with retries and within the provider's rate limits.
/// </summary>
public sealed class SyncJob
{
    public const int MaxErrorLength = 500;

    /// <summary>Waits between attempts. After the last one the job is marked failed and left for the runner to see.</summary>
    public static readonly IReadOnlyList<TimeSpan> RetryDelays =
    [
        TimeSpan.FromMinutes(1),
        TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(30),
        TimeSpan.FromHours(2),
        TimeSpan.FromHours(12),
    ];

    private SyncJob()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public SyncProvider Provider { get; private set; }

    public SyncJobKind Kind { get; private set; }

    /// <summary>The provider's id for the run, for jobs about one run.</summary>
    public long? ObjectId { get; private set; }

    public SyncPriority Priority { get; private set; }

    public DateTimeOffset NotBefore { get; private set; }

    public int Attempts { get; private set; }

    public string? LastError { get; private set; }

    /// <summary>Out of retries. Kept (not retried) so the runner can be told a run couldn't be fetched.</summary>
    public bool Failed { get; private set; }

    /// <summary>
    /// Fetched but deliberately not kept (too short, not a run, already uploaded, or the run limit reached). Not an
    /// error and not retried; kept briefly with the reason so the runner can see why a run didn't appear.
    /// </summary>
    public bool Skipped { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public static SyncJob Create(Guid runnerId, SyncProvider provider, SyncJobKind kind, long? objectId, SyncPriority priority, DateTimeOffset now, DateTimeOffset? notBefore = null)
    {
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("A sync job belongs to a runner.");
        }

        if (kind is SyncJobKind.FetchActivity or SyncJobKind.DeleteActivity && objectId is not > 0)
        {
            throw new DomainException("A job about one run needs that run's id.");
        }

        return new SyncJob
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            Provider = provider,
            Kind = kind,
            ObjectId = objectId,
            Priority = priority,
            NotBefore = notBefore ?? now,
            CreatedAt = now,
        };
    }

    public bool IsDue(DateTimeOffset now) => !Failed && NotBefore <= now;

    /// <summary>Done with, on purpose: the run won't be kept, for <paramref name="reason"/>.</summary>
    public void Skip(string reason)
    {
        ArgumentNullException.ThrowIfNull(reason);
        LastError = reason.Length > MaxErrorLength ? reason[..MaxErrorLength] : reason;
        Failed = true;
        Skipped = true;
    }

    /// <summary>The runner asked to try a failed fetch again: a fresh set of attempts, starting now.</summary>
    public void Retry(DateTimeOffset now)
    {
        if (!Failed || Skipped)
        {
            throw new DomainException("Only a fetch that failed can be tried again.");
        }

        Failed = false;
        Attempts = 0;
        LastError = null;
        NotBefore = now;
    }

    /// <summary>Not this job's fault (the rate limit is spent): try again later without using up an attempt.</summary>
    public void Defer(DateTimeOffset until)
    {
        if (until > NotBefore)
        {
            NotBefore = until;
        }
    }

    /// <summary>An attempt failed. Schedules the next one, or marks the job failed once the retries are used up.</summary>
    public void Fail(DateTimeOffset now, string error)
    {
        ArgumentNullException.ThrowIfNull(error);
        Attempts++;
        LastError = error.Length > MaxErrorLength ? error[..MaxErrorLength] : error;
        if (Attempts > RetryDelays.Count)
        {
            Failed = true;
            return;
        }

        NotBefore = now + RetryDelays[Attempts - 1];
    }
}
