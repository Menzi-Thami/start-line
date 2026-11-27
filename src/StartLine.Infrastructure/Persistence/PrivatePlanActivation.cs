using System.Data;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.PrivatePlans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Plans;

namespace StartLine.Infrastructure.Persistence;

internal sealed class PrivatePlanActivation(StartLineDbContext db, IRaceCatalogue catalogue) : IPrivatePlanActivation
{
    public async Task<Guid> ActivateAsync(Guid runnerId, Guid importId, string tokenHash, bool consent, DateOnly today, DateTimeOffset now, CancellationToken cancellationToken)
    {
        try
        {
            return await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                // Serializable predicate locks also protect a runner who has no active plan yet.
                db.ChangeTracker.Clear();
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var runner = await db.Runners.SingleOrDefaultAsync(r => r.Id == runnerId && r.PrivatePrescriptionsEnabled, cancellationToken)
                    ?? throw new NotFoundException("Private import", "pilot");
                var import = await db.PrivatePlanImports.SingleOrDefaultAsync(i => i.Id == importId && i.RunnerId == runner.Id, cancellationToken);
                if (import is null || !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(import.TokenHash), Encoding.ASCII.GetBytes(tokenHash))) throw new NotFoundException("Private import", "preview");
                if (!consent) throw new ConflictException("private_consent_required", "Review the prescription and explicitly agree to make it current. Your existing plan will be archived.");
                if (import.ActivatedPlanId is { } already)
                {
                    await transaction.CommitAsync(cancellationToken);
                    return already;
                }
                if (import.ExpiresAt <= now || import.ReviewedOn != today)
                    throw new ConflictException("private_preview_expired", "Preview the import again before making it current.");
                var active = await db.SavedPlans.SingleOrDefaultAsync(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active, cancellationToken);
                if (active?.Id != import.ExpectedActiveId || (active is not null && Convert.ToBase64String(active.Version) != import.ExpectedActiveVersion))
                    throw new ConflictException("private_plan_changed", "Your current plan changed. Preview the import again before replacing it.");
                if (active is not null)
                {
                    if (active.Prescription is null && active.Inputs.RaceSlug is { } slug && catalogue.FindBySlug(slug) is { } race)
                        active.Update(active.Inputs with { RaceName = race.Name, RaceDate = race.Date, DistanceKm = race.Distance.Kilometres });
                    active.Archive();
                    await db.SaveChangesAsync(cancellationToken);
                }
                var saved = SavedPlan.CreatePrivate(runner.Id, import.Name, import.Inputs, import.Prescription);
                db.SavedPlans.Add(saved);
                import.Activate(saved.Id);
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return saved.Id;
            });
        }
        catch (DbUpdateException e) when (e.InnerException is SqlException { Number: 2601 or 2627 or 1205 })
        {
            throw new ConflictException("private_plan_changed", "Your current plan changed on another device. Preview the import again.");
        }
    }
}
