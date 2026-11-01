using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Notifications;
using StartLine.Domain.Activities;
using StartLine.Domain.Common;
using StartLine.Domain.Notifications;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Sync;

/// <summary>The queued sync work, as the worker in Infrastructure sees it.</summary>
public interface IStravaSync
{
    /// <summary>Runs every job that's due (one batch) and drops lapsed copies. Returns when there's next something to do.</summary>
    Task<DateTimeOffset?> RunDueAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Does the queued Strava work: reads runs, deletes them, backfills, catches up and keeps the 7-day cache fresh. Run
/// by the sync worker in Infrastructure; everything decision-relevant is here so it's tested without a host.
/// </summary>
internal sealed partial class StravaSyncRunner(
    IApplicationDbContext db,
    IStravaApi strava,
    StravaRateGate gate,
    StravaTokens tokens,
    ActivityImporter importer,
    RunCelebrator prompter,
    TimeProvider time,
    ILogger<StravaSyncRunner> logger) : IStravaSync
{
    /// <summary>Jobs per pass. The worker calls again straight away while there's more due.</summary>
    public const int BatchSize = 20;

    /// <summary>Six weeks of runs is well under this; it stops a runaway listing.</summary>
    public const int MaxPages = 5;

    public static readonly TimeSpan RefreshInterval = TimeSpan.FromDays(1);

    // Runs recorded or refreshed by the job in hand: once they're saved, the runner may be asked to tick their session.
    private readonly List<Activity> synced = [];

    public async Task<DateTimeOffset?> RunDueAsync(CancellationToken cancellationToken)
    {
        await DropLapsedAsync(cancellationToken);

        var now = time.GetUtcNow();
        var jobs = await db.SyncJobs
            .Where(j => !j.Failed && j.NotBefore <= now)
            .OrderBy(j => j.Priority).ThenBy(j => j.NotBefore)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        foreach (var job in jobs)
        {
            await RunOneAsync(job, cancellationToken);
        }

        return await NextDueAsync(cancellationToken);
    }

    // Set by a fetch that ran fine but didn't keep the run, so the job is recorded as skipped rather than removed.
    private string? skipReason;

    private async Task RunOneAsync(SyncJob job, CancellationToken cancellationToken)
    {
        synced.Clear();
        skipReason = null;
        var now = time.GetUtcNow();
        // Deleting needs no call to Strava, so it never waits for the rate limit.
        if (gate.BlockedUntil() is { } blocked && job.Kind is not (SyncJobKind.DeleteActivity or SyncJobKind.Deauthorize))
        {
            job.Defer(blocked);
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        try
        {
            await (job.Kind switch
            {
                SyncJobKind.FetchActivity => FetchAsync(job, cancellationToken),
                SyncJobKind.DeleteActivity => DeleteAsync(job, cancellationToken),
                SyncJobKind.Deauthorize => ForgetAsync(job, cancellationToken),
                SyncJobKind.Backfill => ListAsync(job, now - StravaCache.Backfill, SyncPriority.Backfill, cancellationToken),
                SyncJobKind.CatchUp => CatchUpAsync(job, cancellationToken),
                SyncJobKind.Refresh => RefreshAsync(job, cancellationToken),
                _ => throw new InvalidOperationException($"No handler for {job.Kind}."),
            });
            if (skipReason is not null)
            {
                // Kept for a week with the reason, so the runner can see why a run from Strava didn't appear.
                job.Skip(skipReason);
            }
            else if (db.SyncJobs.Entry(job).State != EntityState.Detached)
            {
                db.SyncJobs.Remove(job);
            }
        }
        catch (StravaRateLimitedException e)
        {
            job.Defer(e.RetryAt);
        }
        catch (StravaUnauthorizedException e)
        {
            // Nothing can run for this runner until they connect again; the status shows them that.
            job.Fail(now, e.Message);
            await RequireReconnectAsync(job.RunnerId, cancellationToken);
        }
        catch (StravaUnavailableException e)
        {
            job.Fail(now, e.Message);
            LogRetry(logger, job.Kind, job.Attempts, e);
        }
        catch (DomainException e)
        {
            // Strava has it, but it isn't something Taperday can show (a watch started by accident). Not worth retrying.
            LogSkipped(logger, job.ObjectId, e.Message);
            job.Skip(e.Message);
        }

        await db.SaveChangesAsync(cancellationToken);
        foreach (var run in synced)
        {
            await prompter.OfferAsync(run, cancellationToken);
        }
    }

    private async Task<ProviderConnection?> ConnectionAsync(Guid runnerId, CancellationToken cancellationToken) =>
        await db.ProviderConnections.SingleOrDefaultAsync(c => c.RunnerId == runnerId && c.Provider == SyncProvider.Strava, cancellationToken);

    private async Task FetchAsync(SyncJob job, CancellationToken cancellationToken)
    {
        var connection = await ConnectionAsync(job.RunnerId, cancellationToken);
        if (connection is null)
        {
            return;
        }

        var id = job.ObjectId!.Value;
        var token = await tokens.AccessTokenAsync(connection, cancellationToken);
        var activity = await strava.GetActivityAsync(token, id, cancellationToken);
        if (activity is null || activity.AthleteId != connection.ExternalAthleteId || !StravaRecording.IsRun(activity.SportType))
        {
            // Gone, private beyond what was granted, or changed to a ride: Taperday mustn't keep a copy.
            await DeleteLocalAsync(job.RunnerId, id, cancellationToken);
            return;
        }

        var recording = StravaRecording.From(activity, await strava.GetStreamsAsync(token, id, cancellationToken));
        if (recording is null)
        {
            await DeleteLocalAsync(job.RunnerId, id, cancellationToken);
            return;
        }

        var now = time.GetUtcNow();
        var runner = await db.Runners.SingleAsync(r => r.Id == job.RunnerId, cancellationToken);
        var fresh = await importer.RecordAsync(runner, recording, ActivityOrigin.Strava(id, now, StravaRecording.RecordedOnGarmin(activity)), cancellationToken);

        var externalId = fresh.ExternalId;
        var existing = await db.Activities.SingleOrDefaultAsync(
            a => a.RunnerId == job.RunnerId && a.Source == ActivitySource.Strava && a.ExternalId == externalId, cancellationToken);
        if (existing is not null)
        {
            existing.RefreshFrom(fresh);
            synced.Add(existing);
        }
        else if (await UploadedAlreadyAsync(job.RunnerId, fresh, cancellationToken))
        {
            // The runner uploaded this run's file already. The upload stays; the two are never merged (Policy 5.4).
            skipReason = SkipReasons.AlreadyUploaded;
            return;
        }
        else if (await db.Activities.Visible(now).CountAsync(a => a.RunnerId == job.RunnerId, cancellationToken) >= Activity.MaxPerRunner)
        {
            skipReason = SkipReasons.LimitReached;
            return;
        }
        else
        {
            db.Activities.Add(fresh);
            synced.Add(fresh);
        }

        connection.MarkSynced(now);
    }

    /// <summary>An upload of the same run: the same start, or near it with the same distance (see <see cref="RunMatch"/>).</summary>
    private async Task<bool> UploadedAlreadyAsync(Guid runnerId, Activity fresh, CancellationToken cancellationToken)
    {
        var from = fresh.StartedAt - RunMatch.SameStartWithin;
        var to = fresh.StartedAt + RunMatch.SameStartWithin;
        var uploads = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runnerId && a.Source == ActivitySource.Upload && a.StartedAt >= from && a.StartedAt <= to)
            .Select(a => new { a.StartedAt, a.DistanceMetres })
            .ToListAsync(cancellationToken);
        return uploads.Any(u => u.StartedAt == fresh.StartedAt || RunMatch.IsSameRun(u.StartedAt, u.DistanceMetres, fresh.StartedAt, fresh.DistanceMetres));
    }

    private Task DeleteAsync(SyncJob job, CancellationToken cancellationToken) => DeleteLocalAsync(job.RunnerId, job.ObjectId!.Value, cancellationToken);

    private async Task DeleteLocalAsync(Guid runnerId, long stravaId, CancellationToken cancellationToken)
    {
        var externalId = ActivityOrigin.Strava(stravaId, time.GetUtcNow(), false).ExternalId;
        var copy = await db.Activities.SingleOrDefaultAsync(
            a => a.RunnerId == runnerId && a.Source == ActivitySource.Strava && a.ExternalId == externalId, cancellationToken);
        if (copy is not null)
        {
            db.Activities.Remove(copy);
        }
    }

    /// <summary>The runner revoked Taperday at Strava: delete everything synced, this job included.</summary>
    private async Task ForgetAsync(SyncJob job, CancellationToken cancellationToken)
    {
        await StravaStatus.ForgetAsync(db, job.RunnerId, cancellationToken);
    }

    private async Task CatchUpAsync(SyncJob job, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var latest = await db.Activities.Visible(now)
            .Where(a => a.RunnerId == job.RunnerId && a.Source == ActivitySource.Strava)
            .MaxAsync(a => (DateTimeOffset?)a.StartedAt, cancellationToken);
        // From a day before the newest synced run, so an edit or a late upload to Strava is still picked up.
        var after = latest is { } l && l.AddDays(-1) > now - StravaCache.Backfill ? l.AddDays(-1) : now - StravaCache.Backfill;
        await ListAsync(job, after, SyncPriority.CatchUp, cancellationToken);
    }

    private async Task ListAsync(SyncJob job, DateTimeOffset after, SyncPriority priority, CancellationToken cancellationToken)
    {
        var connection = await ConnectionAsync(job.RunnerId, cancellationToken);
        if (connection is null)
        {
            return;
        }

        var now = time.GetUtcNow();
        var token = await tokens.AccessTokenAsync(connection, cancellationToken);
        var cached = await db.Activities.Visible(now)
            .Where(a => a.RunnerId == job.RunnerId)
            .Select(a => new { a.Source, a.ExternalId, a.StartedAt, a.CachedUntil })
            .ToListAsync(cancellationToken);

        for (var page = 1; page <= MaxPages; page++)
        {
            var runs = await strava.ListActivitiesAsync(token, after, page, cancellationToken);
            foreach (var run in runs.Where(r => StravaRecording.IsRun(r.SportType)))
            {
                var id = ActivityOrigin.Strava(run.Id, now, false).ExternalId;
                var have = cached.FirstOrDefault(c => c.Source == ActivitySource.Strava && c.ExternalId == id);
                // Only an exact start skips the fetch here: a near one is checked against the distance once fetched.
                var uploaded = cached.Any(c => c.Source == ActivitySource.Upload && c.StartedAt == run.StartDate.ToUniversalTime());
                if (uploaded || (have is not null && !StravaCache.IsDueForRefresh(have.CachedUntil, now)))
                {
                    continue;
                }

                await StravaStatus.EnqueueAsync(db, SyncJob.Create(job.RunnerId, SyncProvider.Strava, SyncJobKind.FetchActivity, run.Id, priority, now), cancellationToken);
            }

            if (runs.Count < IStravaApi.PageSize)
            {
                break;
            }
        }
    }

    /// <summary>Daily: queue a fetch for every synced run whose copy would otherwise lapse, then book tomorrow's.</summary>
    private async Task RefreshAsync(SyncJob job, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var connection = await ConnectionAsync(job.RunnerId, cancellationToken);
        if (connection is null)
        {
            return;
        }

        var due = await db.Activities.Visible(now)
            .Where(a => a.RunnerId == job.RunnerId && a.Source == ActivitySource.Strava && a.CachedUntil < now + StravaCache.RefreshWithin)
            .Select(a => a.ExternalId!)
            .ToListAsync(cancellationToken);
        foreach (var externalId in due)
        {
            await StravaStatus.EnqueueAsync(
                db, SyncJob.Create(job.RunnerId, SyncProvider.Strava, SyncJobKind.FetchActivity, long.Parse(externalId, System.Globalization.CultureInfo.InvariantCulture), SyncPriority.Refresh, now), cancellationToken);
        }

        db.SyncJobs.Remove(job);
        db.SyncJobs.Add(SyncJob.Create(job.RunnerId, SyncProvider.Strava, SyncJobKind.Refresh, null, SyncPriority.Refresh, now, now + RefreshInterval));
    }

    private async Task RequireReconnectAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        if (await ConnectionAsync(runnerId, cancellationToken) is { } connection)
        {
            connection.RequireReconnect();
        }
    }

    /// <summary>Synced copies past their 7 days are deleted, whatever else is going on. They're already hidden from every read.</summary>
    private async Task DropLapsedAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var lapsed = await db.Activities.Where(a => a.CachedUntil != null && a.CachedUntil <= now).ToListAsync(cancellationToken);
        if (lapsed.Count > 0)
        {
            db.Activities.RemoveRange(lapsed);
            await db.SaveChangesAsync(cancellationToken);
            LogDropped(logger, lapsed.Count);
        }

        // Being asked to tick a session is noted only while a synced run could still ask again, then forgotten.
        var askedBefore = DateOnly.FromDateTime(now.UtcDateTime).AddDays(-(int)TickPrompts.KeptFor.TotalDays);
        var asked = await db.TickPrompts.Where(p => p.Date < askedBefore).ToListAsync(cancellationToken);
        if (asked.Count > 0)
        {
            db.TickPrompts.RemoveRange(asked);
            await db.SaveChangesAsync(cancellationToken);
        }

        // A run that couldn't be fetched is mentioned for a week, then forgotten.
        var stale = await db.SyncJobs.Where(j => j.Failed && j.CreatedAt < now - StravaCache.Lifetime).ToListAsync(cancellationToken);
        if (stale.Count > 0)
        {
            db.SyncJobs.RemoveRange(stale);
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task<DateTimeOffset?> NextDueAsync(CancellationToken cancellationToken)
    {
        var job = await db.SyncJobs.Where(j => !j.Failed).MinAsync(j => (DateTimeOffset?)j.NotBefore, cancellationToken);
        var lapse = await db.Activities.Where(a => a.CachedUntil != null).MinAsync(a => a.CachedUntil, cancellationToken);
        return (job, lapse) switch
        {
            ({ } j, { } l) => j < l ? j : l,
            ({ } j, null) => j,
            (null, var l) => l,
        };
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Strava {Kind} failed (attempt {Attempts}); will retry")]
    private static partial void LogRetry(ILogger logger, SyncJobKind kind, int attempts, Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Skipped Strava activity {ActivityId}: {Reason}")]
    private static partial void LogSkipped(ILogger logger, long? activityId, string reason);

    [LoggerMessage(Level = LogLevel.Information, Message = "Dropped {Count} lapsed Strava copies")]
    private static partial void LogDropped(ILogger logger, int count);
}
