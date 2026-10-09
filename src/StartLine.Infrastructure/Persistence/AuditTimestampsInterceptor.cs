using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace StartLine.Infrastructure.Persistence;

/// <summary>
/// Stamps CreatedAt/UpdatedAt from the injected clock on every save, so entities never read the time
/// themselves. Note: ExecuteUpdate/ExecuteDelete bypass this; set the stamps by hand if you use them.
/// </summary>
internal sealed class AuditTimestampsInterceptor(TimeProvider timeProvider) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Stamp(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Stamp(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    private void Stamp(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var now = timeProvider.GetUtcNow();
        foreach (var entry in context.ChangeTracker.Entries())
        {
            var created = entry.Metadata.FindProperty("CreatedAt");
            var updated = entry.Metadata.FindProperty("UpdatedAt");
            if (entry.State == EntityState.Added && created is not null)
            {
                entry.Property(created.Name).CurrentValue = now;
            }

            if (entry.State is EntityState.Added or EntityState.Modified && updated is not null)
            {
                entry.Property(updated.Name).CurrentValue = now;
            }
        }
    }
}
