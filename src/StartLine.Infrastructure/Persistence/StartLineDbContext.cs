using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Sync;

namespace StartLine.Infrastructure.Persistence;

public sealed class StartLineDbContext(DbContextOptions<StartLineDbContext> options) : DbContext(options), IApplicationDbContext, IDataProtectionKeyContext
{
    public DbSet<Runner> Runners => Set<Runner>();

    public DbSet<SavedPlan> SavedPlans => Set<SavedPlan>();

    public DbSet<Activity> Activities => Set<Activity>();

    public DbSet<ProviderConnection> ProviderConnections => Set<ProviderConnection>();

    public DbSet<SyncJob> SyncJobs => Set<SyncJob>();

    public DbSet<SessionCheckIn> SessionCheckIns => Set<SessionCheckIn>();

    /// <summary>The Data Protection key ring that encrypts Strava tokens. Wrapped by Key Vault in Azure.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(StartLineDbContext).Assembly);
    }
}
