using Microsoft.EntityFrameworkCore;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Sync;

namespace StartLine.Application.Common;

/// <summary>The signed-in caller, from the validated token only. Never from the request body.</summary>
public interface ICurrentUser
{
    /// <summary>The identity provider's stable id for the user, or null when anonymous.</summary>
    string? Subject { get; }

    string? Email { get; }
}

public interface IApplicationDbContext
{
    DbSet<Runner> Runners { get; }

    DbSet<SavedPlan> SavedPlans { get; }

    DbSet<Activity> Activities { get; }

    DbSet<ProviderConnection> ProviderConnections { get; }

    DbSet<SyncJob> SyncJobs { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}

public static class ActivityQueries
{
    /// <summary>
    /// Runs that may be shown: every upload, and synced runs whose cache hasn't lapsed. The sync worker deletes lapsed
    /// copies, but the app can sleep past that moment; this makes sure nothing older than the cache allows is ever read.
    /// </summary>
    public static IQueryable<Activity> Visible(this IQueryable<Activity> activities, DateTimeOffset now) =>
        activities.Where(a => a.CachedUntil == null || a.CachedUntil > now);
}
