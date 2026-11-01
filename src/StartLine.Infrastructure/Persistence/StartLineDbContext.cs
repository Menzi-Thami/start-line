using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Notifications;
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

    public DbSet<StartLine.Domain.Shoes.Shoe> Shoes => Set<StartLine.Domain.Shoes.Shoe>();

    public DbSet<StartLine.Domain.Shoes.ShoeAssignment> ShoeAssignments => Set<StartLine.Domain.Shoes.ShoeAssignment>();

    public DbSet<SessionCheckIn> SessionCheckIns => Set<SessionCheckIn>();

    public DbSet<CoachWeek> CoachWeeks => Set<CoachWeek>();

    public DbSet<WeeklyRecapDelivery> WeeklyRecapDeliveries => Set<WeeklyRecapDelivery>();

    public DbSet<CoachingDecisionLog> CoachingDecisions => Set<CoachingDecisionLog>();

    public DbSet<DailyReadiness> Readiness => Set<DailyReadiness>();

    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();

    public DbSet<NotificationDelivery> NotificationDeliveries => Set<NotificationDelivery>();

    public DbSet<TickPrompt> TickPrompts => Set<TickPrompt>();

    public DbSet<RunnerPhoto> RunnerPhotos => Set<RunnerPhoto>();

    public DbSet<Feedback> Feedback => Set<Feedback>();

    /// <summary>The Data Protection key ring that encrypts Strava tokens. Wrapped by Key Vault in Azure.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(StartLineDbContext).Assembly);
    }
}
