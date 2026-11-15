using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Journey;

namespace StartLine.Application.Features.Journey;

/// <summary>Records (or corrects) how a plan's race went. One result per plan; saving again replaces it.</summary>
public sealed record SaveRaceResultCommand(Guid PlanId, SaveRaceResultRequest Result) : IRequest<RaceResultDto>;

internal sealed class SaveRaceResultValidator : AbstractValidator<SaveRaceResultCommand>
{
    public SaveRaceResultValidator()
    {
        RuleFor(c => c.Result).NotNull();
        RuleFor(c => c.Result.Outcome).IsInEnum().When(c => c.Result is not null);
        RuleFor(c => c.Result.FinishTime)
            .InclusiveBetween(RaceResult.MinFinishTime, RaceResult.MaxFinishTime)
            .When(c => c.Result?.FinishTime is not null)
            .WithMessage("A finish time is between 1 minute and 48 hours.");
        RuleFor(c => c.Result.DistanceKm)
            .InclusiveBetween(RaceResult.MinDistanceKm, RaceResult.MaxDistanceKm)
            .When(c => c.Result?.DistanceKm is not null);
        RuleFor(c => c.Result.Note).MaximumLength(RaceResult.MaxNoteLength).When(c => c.Result is not null);
        RuleFor(c => c.Result.ExpectedVersion).MaximumLength(64).When(c => c.Result is not null);
    }
}

internal sealed class SaveRaceResultHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
    : IRequestHandler<SaveRaceResultCommand, RaceResultDto>
{
    public async Task<RaceResultDto> Handle(SaveRaceResultCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var saved = await OwnJourney.PlanAsync(db, runner, request.PlanId, cancellationToken);
        var r = request.Result;
        if (r.ActivityId is { } activityId
            && !await db.Activities.Visible(time.GetUtcNow()).AnyAsync(a => a.Id == activityId && a.RunnerId == runner.Id, cancellationToken))
        {
            throw new NotFoundException("Activity", activityId.ToString());
        }

        var today = CoachCalls.LocalToday(runner, time);
        var plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved), paceDate: today);
        var answers = new RaceResultAnswers(r.Outcome, r.RaceDate ?? plan.RaceDate, r.FinishTime, r.DistanceKm, r.ActivityId, r.Note);

        var result = await db.RaceResults.SingleOrDefaultAsync(x => x.SavedPlanId == saved.Id, cancellationToken);
        RequireVersion(r.ExpectedVersion, result);
        result = Apply(result, runner.Id, saved.Id, answers, plan.StartDate, today);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException) when (r.ExpectedVersion is not null)
        {
            throw new ConflictException("race_result_changed", "Your race result changed on another device. Load it again before saving.");
        }
        catch (DbUpdateException)
        {
            // Saved twice at once (a retry, a double tap, a second device) with no version to hold to: one result, the
            // latest answer. If this fails too, it wasn't a clash.
            db.RaceResults.Entry(result).State = EntityState.Detached;
            var latest = await db.RaceResults.SingleOrDefaultAsync(x => x.SavedPlanId == saved.Id, cancellationToken);
            result = Apply(latest, runner.Id, saved.Id, answers, plan.StartDate, today);
            await db.SaveChangesAsync(cancellationToken);
        }

        await RaceAchievements.FollowAsync(db, runner.Id, result, time.GetUtcNow(), cancellationToken);
        return RaceResultDto.From(result, saved.Inputs.GoalTime);
    }

    /// <summary>Records a new result or changes the one there. Doesn't save.</summary>
    private RaceResult Apply(RaceResult? result, Guid runnerId, Guid planId, RaceResultAnswers answers, DateOnly planStart, DateOnly today)
    {
        if (result is not null)
        {
            result.Change(answers, planStart, today);
            return result;
        }

        var recorded = RaceResult.Record(runnerId, planId, answers, planStart, today);
        db.RaceResults.Add(recorded);
        return recorded;
    }

    private static void RequireVersion(string? expected, RaceResult? result)
    {
        if (expected is not null && (result is null || !JourneyVersion.Matches(expected, result.Version)))
        {
            throw new ConflictException("race_result_changed", "Your race result changed on another device. Load it again before saving.");
        }
    }
}

/// <summary>Takes back a race result (an undo). The finisher badge goes with it. Taking back none is fine.</summary>
public sealed record DeleteRaceResultCommand(Guid PlanId) : IRequest<bool>;

internal sealed class DeleteRaceResultHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteRaceResultCommand, bool>
{
    public async Task<bool> Handle(DeleteRaceResultCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var saved = await OwnJourney.PlanAsync(db, runner, request.PlanId, cancellationToken);
        await db.RaceResults.Where(r => r.SavedPlanId == saved.Id).ExecuteDeleteAsync(cancellationToken);
        await db.Achievements.Where(a => a.SavedPlanId == saved.Id && a.Kind == AchievementKind.RaceFinished).ExecuteDeleteAsync(cancellationToken);
        return true;
    }
}

/// <summary>The finisher badge follows the race result, at once, rather than waiting for the next journey read.</summary>
internal static class RaceAchievements
{
    public static async Task FollowAsync(IApplicationDbContext db, Guid runnerId, RaceResult result, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (result.Outcome != RaceOutcome.Finished)
        {
            await db.Achievements.Where(a => a.SavedPlanId == result.SavedPlanId && a.Kind == AchievementKind.RaceFinished).ExecuteDeleteAsync(cancellationToken);
            return;
        }

        var updated = await db.Achievements.Where(a => a.SavedPlanId == result.SavedPlanId && a.Kind == AchievementKind.RaceFinished)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.EarnedOn, result.RaceDate), cancellationToken);
        if (updated > 0)
        {
            return;
        }

        var award = Achievement.Award(runnerId, result.SavedPlanId, AchievementKind.RaceFinished, result.RaceDate, now);
        db.Achievements.Add(award);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Awarded by a concurrent request: already awarded. Anything else is a real failure.
            db.Achievements.Entry(award).State = EntityState.Detached;
            if (!await db.Achievements.AsNoTracking().AnyAsync(a => a.SavedPlanId == result.SavedPlanId && a.Kind == AchievementKind.RaceFinished, cancellationToken))
            {
                throw;
            }
        }
    }
}
