using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.Races;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.MyPlans;

/// <summary>Concludes elapsed training on read, preserving its race snapshot, check-ins and independent recovery.</summary>
internal sealed class TrainingLifecycle(IApplicationDbContext db, IRaceCatalogue catalogue, TimeProvider time)
{
    public async Task ConcludeAsync(Runner runner, CancellationToken cancellationToken)
    {
        var today = CoachCalls.LocalToday(runner, time);
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var plans = await db.SavedPlans.Where(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active).ToListAsync(cancellationToken);
            var changed = false;
            foreach (var plan in plans)
            {
                if (SavedPlanSummaries.Of(plan, catalogue).RaceDate is not { } raceDate || raceDate >= today) continue;
                SavedPlanMapping.FreezeRace(plan, catalogue);
                changed |= plan.Conclude(today);
            }
            if (!changed) return;
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (DbUpdateConcurrencyException exception)
            {
                if (attempt != 0) throw new ConflictException("plan_changed", "Your training plan changed. Refresh to see its latest chapter.");
                foreach (var entry in exception.Entries) await entry.ReloadAsync(cancellationToken);
            }
        }
    }
}
