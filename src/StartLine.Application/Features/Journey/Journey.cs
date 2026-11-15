using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Activities;
using StartLine.Domain.Journey;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Journey;

/// <summary>
/// Reads the runner's plans as chapters of their journey: each plan rebuilt exactly as the runner sees it, its training
/// told truthfully (<see cref="TrainingRecap"/>), its race result, recovery and badges. Badges are kept in step on every
/// read, so plans that already qualify are awarded the first time they're read, even past plans.
/// </summary>
internal sealed class JourneyReader(IApplicationDbContext db, PlanBuilder builder, IRaceCatalogue catalogue, TimeProvider time)
{
    /// <summary>How long a finished recovery is still shown on the journey.</summary>
    public const int RecentRecoveryDays = 30;

    public async Task<IReadOnlyList<PlanChapterDto>> ChaptersAsync(Runner runner, Guid? onlyPlan, bool withWeeks, CancellationToken cancellationToken)
    {
        var today = CoachCalls.LocalToday(runner, time);
        var plans = await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runner.Id && (onlyPlan == null || p.Id == onlyPlan))
            .OrderBy(p => p.Status).ThenByDescending(p => p.UpdatedAt).ThenByDescending(p => p.Id)
            .Take(SavedPlan.MaxKeptPerRunner)
            .ToListAsync(cancellationToken);
        if (plans.Count == 0)
        {
            return [];
        }

        var planIds = plans.Select(p => p.Id).ToList();
        var checkIns = (await db.SessionCheckIns.AsNoTracking().Where(c => planIds.Contains(c.SavedPlanId)).ToListAsync(cancellationToken))
            .ToLookup(c => c.SavedPlanId, c => new RecapCheckIn(c.Id, c.Date, c.SessionType, c.Status, c.IsAdditional, c.DistanceKm, c.DistanceUnreported, c.ActivityId, c.PrescribedKm));
        var calls = (await db.CoachWeeks.AsNoTracking().Where(w => planIds.Contains(w.SavedPlanId)).OrderBy(w => w.WeekStart).ToListAsync(cancellationToken))
            .ToLookup(w => w.SavedPlanId, w => w.ToDecision());
        var results = await db.RaceResults.AsNoTracking().Where(r => planIds.Contains(r.SavedPlanId)).ToDictionaryAsync(r => r.SavedPlanId, cancellationToken);
        var recoveries = (await db.RecoveryPlans.AsNoTracking().Where(r => r.RunnerId == runner.Id && r.SavedPlanId != null).ToListAsync(cancellationToken))
            .ToDictionary(r => r.SavedPlanId!.Value);
        // Uploaded files only: a synced Strava copy is never evidence for anything kept.
        var uploads = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.Kind != ActivityKind.Other)
            .Select(a => new RecapRun(a.Id, a.LocalDate, a.DistanceMetres / 1000, a.Source, a.Kind))
            .ToListAsync(cancellationToken);

        var built = new List<(SavedPlan Saved, TrainingPlan Plan, TrainingRecapResult Recap)>();
        foreach (var saved in plans)
        {
            // Legacy rows without a snapshot cannot be reconstructed honestly. Keep their chapter visible below.
            if (!saved.Inputs.HasRaceSnapshot && saved.Inputs.RaceSlug is { } slug && catalogue.FindBySlug(slug) is null)
            {
                continue;
            }

            var plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved), [.. calls[saved.Id]], saved.Adjustments, today);
            built.Add((saved, plan, TrainingRecap.Evaluate(plan.StartDate, plan.RaceDate, plan.Weeks, checkIns[saved.Id], uploads, today)));
        }

        var achievements = await SyncAchievementsAsync(runner.Id, built.Select(b => (b.Saved, b.Recap, results.GetValueOrDefault(b.Saved.Id))).ToList(), cancellationToken);
        var chapters = built.Select(b =>
        {
            var result = results.GetValueOrDefault(b.Saved.Id);
            var summary = SavedPlanSummaries.Of(b.Saved, catalogue);
            var recovery = recoveries.GetValueOrDefault(b.Saved.Id);
            return new PlanChapterDto(
                b.Saved.Id, b.Saved.Name, summary.RaceName, b.Plan.RaceDate, b.Plan.RaceDistance.Kilometres, b.Saved.Status, b.Plan.StartDate,
                TrainingRecap.Lifecycle(b.Recap, b.Saved.Status == SavedPlanStatus.Archived, result?.Outcome, recovery?.Status),
                TrainingRecapDto.From(b.Recap),
                result is null ? null : RaceResultDto.From(result, b.Saved.Inputs.GoalTime),
                [.. achievements.Where(a => a.SavedPlanId == b.Saved.Id).OrderBy(a => a.Kind).Select(AchievementDto.From)],
                b.Saved.Inputs.GoalTime,
                withWeeks ? [.. b.Recap.WeekBreakdown.Select(w => new ChapterWeekDto(w.WeekStart, w.ScheduledRuns, w.ConfirmedRuns, w.RecordedKm))] : null);
        }).ToDictionary(c => c.PlanId);
        // Do not invent a schedule, counts or a new award when a legacy race's details were never retained.
        var unavailableIds = plans.Where(p => !chapters.ContainsKey(p.Id)).Select(p => p.Id).ToList();
        var retainedAwards = await db.Achievements.AsNoTracking()
            .Where(a => a.RunnerId == runner.Id && unavailableIds.Contains(a.SavedPlanId)).ToListAsync(cancellationToken);
        return [.. plans.Select(saved =>
        {
            if (chapters.TryGetValue(saved.Id, out var chapter)) return chapter;
            var result = results.GetValueOrDefault(saved.Id);
            return new PlanChapterDto(saved.Id, saved.Name, saved.Inputs.RaceName ?? saved.Name, saved.Inputs.RaceDate,
                saved.Inputs.DistanceKm, saved.Status, saved.Inputs.PlanFrom, JourneyLifecycle.Archived,
                new TrainingRecapDto(0, 0, 0, 0, 0, 0, 0, 0, null, 0, null, null, null, false, false, false, 0),
                result is null ? null : RaceResultDto.From(result, saved.Inputs.GoalTime),
                [.. retainedAwards.Where(a => a.SavedPlanId == saved.Id).Select(AchievementDto.From)], saved.Inputs.GoalTime,
                null, DetailsUnavailable: true);
        })];
    }

    /// <summary>The recovery going on, else one finished in the last <see cref="RecentRecoveryDays"/> days.</summary>
    public async Task<RecoveryPlan?> CurrentRecoveryAsync(Runner runner, CancellationToken cancellationToken)
    {
        var today = CoachCalls.LocalToday(runner, time);
        var since = today.AddDays(-RecentRecoveryDays);
        return await db.RecoveryPlans.AsNoTracking()
            .Where(r => r.RunnerId == runner.Id && (r.Status == RecoveryStatus.Active || r.Status == RecoveryStatus.Paused || r.EndedOn >= since))
            .OrderBy(r => r.Status == RecoveryStatus.Active || r.Status == RecoveryStatus.Paused ? 0 : 1)
            .ThenByDescending(r => r.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Awards what each plan has earned and withdraws what it no longer has: "every run done" from a current plan whose
    /// runner un-ticked a run (a past plan keeps its badge), "finished" whenever the race result stops saying so.
    /// Idempotent across requests and devices: a duplicate from a concurrent request is "already awarded".
    /// </summary>
    private async Task<List<Achievement>> SyncAchievementsAsync(
        Guid runnerId, List<(SavedPlan Saved, TrainingRecapResult Recap, RaceResult? Result)> plans, CancellationToken cancellationToken)
    {
        var planIds = plans.Select(p => p.Saved.Id).ToList();
        var existing = await db.Achievements.AsNoTracking().Where(a => a.RunnerId == runnerId && planIds.Contains(a.SavedPlanId)).ToListAsync(cancellationToken);
        var now = time.GetUtcNow();
        var changed = false;
        var added = new List<Achievement>();
        foreach (var (saved, recap, result) in plans)
        {
            var earned = new Dictionary<AchievementKind, DateOnly>();
            if (recap.AllConfirmed && recap.LastConfirmedDate is { } done)
            {
                earned[AchievementKind.TrainingComplete] = done;
            }

            if (result is { Outcome: RaceOutcome.Finished })
            {
                earned[AchievementKind.RaceFinished] = result.RaceDate;
            }

            foreach (var (kind, on) in earned)
            {
                var have = existing.FirstOrDefault(a => a.SavedPlanId == saved.Id && a.Kind == kind);
                if (have is null)
                {
                    var award = Achievement.Award(runnerId, saved.Id, kind, on, now);
                    db.Achievements.Add(award);
                    added.Add(award);
                }
                else if (kind == AchievementKind.RaceFinished && have.EarnedOn != on)
                {
                    await db.Achievements.Where(a => a.Id == have.Id).ExecuteUpdateAsync(s => s.SetProperty(a => a.EarnedOn, on), cancellationToken);
                    changed = true;
                }
            }

            var withdraw = existing.Where(a => a.SavedPlanId == saved.Id && !earned.ContainsKey(a.Kind)
                && (a.Kind == AchievementKind.RaceFinished || saved.Status == SavedPlanStatus.Active)).Select(a => a.Id).ToList();
            if (withdraw.Count > 0)
            {
                await db.Achievements.Where(a => withdraw.Contains(a.Id)).ExecuteDeleteAsync(cancellationToken);
                changed = true;
            }
        }

        if (added.Count > 0)
        {
            changed = true;
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // Another request awarded the same badge first: it is already awarded. Anything else is a real failure.
                foreach (var award in added)
                {
                    db.Achievements.Entry(award).State = EntityState.Detached;
                }

                // The save was all or nothing: award again whatever the other request didn't.
                var nowThere = await db.Achievements.AsNoTracking().Where(a => a.RunnerId == runnerId && planIds.Contains(a.SavedPlanId)).ToListAsync(cancellationToken);
                var stillMissing = added.Where(a => !nowThere.Any(e => e.SavedPlanId == a.SavedPlanId && e.Kind == a.Kind)).ToList();
                if (stillMissing.Count == added.Count)
                {
                    throw;
                }

                if (stillMissing.Count > 0)
                {
                    db.Achievements.AddRange(stillMissing.Select(a => Achievement.Award(runnerId, a.SavedPlanId, a.Kind, a.EarnedOn, now)));
                    await db.SaveChangesAsync(cancellationToken);
                }
            }
        }

        return changed
            ? await db.Achievements.AsNoTracking().Where(a => a.RunnerId == runnerId && planIds.Contains(a.SavedPlanId)).ToListAsync(cancellationToken)
            : existing;
    }
}

internal static class OwnJourney
{
    /// <summary>The runner's own plan, or "not found": another runner's id is never confirmed to exist.</summary>
    public static async Task<SavedPlan> PlanAsync(IApplicationDbContext db, Runner? runner, Guid planId, CancellationToken cancellationToken, bool tracked = false)
    {
        var plans = tracked ? db.SavedPlans : db.SavedPlans.AsNoTracking();
        return (runner is null ? null : await plans.SingleOrDefaultAsync(p => p.Id == planId && p.RunnerId == runner.Id, cancellationToken))
            ?? throw new NotFoundException("Saved plan", planId.ToString());
    }

    public static async Task<RecoveryPlan> RecoveryAsync(IApplicationDbContext db, Runner runner, Guid id, CancellationToken cancellationToken) =>
        await db.RecoveryPlans.SingleOrDefaultAsync(r => r.Id == id && r.RunnerId == runner.Id, cancellationToken)
        ?? throw new NotFoundException("Recovery", id.ToString());
}

public sealed record GetMyJourneyQuery : IRequest<JourneyDto>;

internal sealed class GetMyJourneyHandler(IApplicationDbContext db, CurrentRunner current, JourneyReader reader, TimeProvider time)
    : IRequestHandler<GetMyJourneyQuery, JourneyDto>
{
    public async Task<JourneyDto> Handle(GetMyJourneyQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            return new JourneyDto([], null, null);
        }

        var today = CoachCalls.LocalToday(runner, time);
        var chapters = await reader.ChaptersAsync(runner, null, withWeeks: false, cancellationToken);
        var recovery = await reader.CurrentRecoveryAsync(runner, cancellationToken);
        var maintenance = await db.MaintenancePlans.AsNoTracking()
            .SingleOrDefaultAsync(m => m.RunnerId == runner.Id && m.Status == MaintenanceStatus.Active, cancellationToken);
        return new JourneyDto(chapters, recovery is null ? null : RecoveryPlanDto.From(recovery, today), maintenance is null ? null : MaintenancePlanDto.From(maintenance, today));
    }
}

public sealed record GetMyPlanChapterQuery(Guid PlanId) : IRequest<PlanChapterDto>;

internal sealed class GetMyPlanChapterHandler(IApplicationDbContext db, CurrentRunner current, JourneyReader reader)
    : IRequestHandler<GetMyPlanChapterQuery, PlanChapterDto>
{
    public async Task<PlanChapterDto> Handle(GetMyPlanChapterQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var plan = await OwnJourney.PlanAsync(db, runner, request.PlanId, cancellationToken);
        return (await reader.ChaptersAsync(runner!, plan.Id, withWeeks: true, cancellationToken)).SingleOrDefault()
            ?? throw new NotFoundException("Race", plan.Inputs.RaceSlug ?? plan.Id.ToString());
    }
}

/// <summary>The celebration for a badge has played: it won't play again on any device. Idempotent.</summary>
public sealed record CelebrateAchievementCommand(Guid Id) : IRequest<bool>;

internal sealed class CelebrateAchievementHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time)
    : IRequestHandler<CelebrateAchievementCommand, bool>
{
    public async Task<bool> Handle(CelebrateAchievementCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var achievement = runner is null
            ? null
            : await db.Achievements.SingleOrDefaultAsync(a => a.Id == request.Id && a.RunnerId == runner.Id, cancellationToken);
        if (achievement is null)
        {
            throw new NotFoundException("Achievement", request.Id.ToString());
        }

        if (achievement.CelebratedAt is null)
        {
            achievement.Celebrate(time.GetUtcNow());
            // Only the first celebration counts, whichever device gets there first; nothing to clash over.
            await db.Achievements.Where(a => a.Id == achievement.Id && a.CelebratedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(a => a.CelebratedAt, achievement.CelebratedAt), cancellationToken);
            db.Achievements.Entry(achievement).State = EntityState.Detached;
        }

        return true;
    }
}
