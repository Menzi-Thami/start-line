using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Infrastructure.Persistence;

public sealed class StartLineDbContext(DbContextOptions<StartLineDbContext> options) : DbContext(options), IApplicationDbContext
{
    public DbSet<Runner> Runners => Set<Runner>();

    public DbSet<SavedPlan> SavedPlans => Set<SavedPlan>();

    public DbSet<Activity> Activities => Set<Activity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(StartLineDbContext).Assembly);
    }
}
