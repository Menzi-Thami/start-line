using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Journey;

namespace StartLine.Application.Features.Journey;

/// <param name="Created">False when the same recovery already existed and is returned as it is.</param>
public sealed record StartRecoveryResult(RecoveryPlanDto Recovery, bool Created);

/// <summary>
/// Starts recovery after a race the runner ran: a plan's race whose result says finished or didn't finish, or an event
/// outside a plan in the last 60 days. Never started for the runner. Asking again for the same race returns the same recovery.
/// </summary>
public sealed record StartRecoveryCommand(StartRecoveryRequest Recovery) : IRequest<StartRecoveryResult>;

internal sealed class StartRecoveryValidator : AbstractValidator<StartRecoveryCommand>
{
    public StartRecoveryValidator()
    {
        RuleFor(c => c.Recovery).NotNull();
        When(c => c.Recovery is not null, () =>
        {
            RuleFor(c => c.Recovery.DistanceKm).InclusiveBetween(RecoveryPlan.MinDistanceKm, RecoveryPlan.MaxDistanceKm);
            RuleFor(c => c.Recovery.EventName).MaximumLength(RecoveryPlan.MaxEventNameLength);
            RuleFor(c => c.Recovery.Effort).IsInEnum();
            RuleFor(c => c.Recovery.Preference).IsInEnum();
            RuleFor(c => c.Recovery.Feeling).IsInEnum().When(c => c.Recovery.Feeling is not null);
            RuleForEach(c => c.Recovery.RunDays).IsInEnum();
            RuleForEach(c => c.Recovery.RedFlags).IsInEnum();
            RuleFor(c => c.Recovery.RedFlags).Must(f => f is null || f.Count == 0).When(c => c.Recovery.Feeling is null)
                .WithMessage("Say how you feel along with any warning signs.");
        });
    }
}

internal sealed class StartRecoveryHandler(IApplicationDbContext db, CurrentRunner current, IRaceCatalogue catalogue, TimeProvider time)
    : IRequestHandler<StartRecoveryCommand, StartRecoveryResult>
{
    public async Task<StartRecoveryResult> Handle(StartRecoveryCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var today = CoachCalls.LocalToday(runner, time);
        var r = request.Recovery;
        var raceDate = r.RaceDate;
        var eventName = r.EventName;
        var runDays = r.RunDays;
        if (r.PlanId is { } planId)
        {
            var plan = await OwnJourney.PlanAsync(db, runner, planId, cancellationToken);
            if (await SameAsync(runner.Id, r, cancellationToken) is { } same)
            {
                return new(RecoveryPlanDto.From(same, today), false);
            }

            var result = await db.RaceResults.AsNoTracking().SingleOrDefaultAsync(x => x.SavedPlanId == plan.Id, cancellationToken);
            if (result is not { WasRun: true })
            {
                throw new ConflictException("race_result_required", "Record that you ran the race before starting its recovery.");
            }

            // The race result is the record of when the race was run.
            raceDate = result.RaceDate;
            eventName = string.IsNullOrWhiteSpace(eventName) ? SavedPlanSummaries.Of(plan, catalogue).RaceName : eventName;
            runDays ??= plan.Inputs.RunDays;
        }
        else if (await SameAsync(runner.Id, r, cancellationToken) is { } same)
        {
            return new(RecoveryPlanDto.From(same, today), false);
        }

        if (await db.RecoveryPlans.AnyAsync(x => x.RunnerId == runner.Id && (x.Status == RecoveryStatus.Active || x.Status == RecoveryStatus.Paused), cancellationToken))
        {
            // It may be this very start, landed a moment ago from another request.
            return await SameAsync(runner.Id, r, cancellationToken) is { } started
                ? new(RecoveryPlanDto.From(started, today), false)
                : throw new ConflictException("recovery_active", "You already have a recovery going. Finish or end it first.");
        }

        var recovery = RecoveryPlan.Start(runner.Id, r.PlanId, eventName, r.DistanceKm, raceDate, r.Effort, r.Preference, runDays, today);
        if (r.Feeling is { } feeling)
        {
            recovery.CheckIn(today, feeling, r.RedFlags, null, today);
        }

        db.RecoveryPlans.Add(recovery);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Started twice at once (a retry, a double tap, a second device): the first one is the recovery.
            db.RecoveryPlans.Entry(recovery).State = EntityState.Detached;
            var first = await SameAsync(runner.Id, r, cancellationToken);
            return first is not null
                ? new(RecoveryPlanDto.From(first, today), false)
                : throw new ConflictException("recovery_active", "You already have a recovery going. Finish or end it first.");
        }

        return new(RecoveryPlanDto.From(recovery, today), true);
    }

    /// <summary>The recovery this request asks for, if it already exists: the plan's (whatever its state), or the same event going on.</summary>
    private Task<RecoveryPlan?> SameAsync(Guid runnerId, StartRecoveryRequest r, CancellationToken cancellationToken)
    {
        if (r.PlanId is { } planId)
        {
            return db.RecoveryPlans.AsNoTracking().SingleOrDefaultAsync(x => x.RunnerId == runnerId && x.SavedPlanId == planId, cancellationToken);
        }

        var distance = Math.Round(r.DistanceKm, 2);
        return db.RecoveryPlans.AsNoTracking().FirstOrDefaultAsync(
            x => x.RunnerId == runnerId && x.SavedPlanId == null && x.RaceDate == r.RaceDate && x.DistanceKm == distance
                && (x.Status == RecoveryStatus.Active || x.Status == RecoveryStatus.Paused),
            cancellationToken);
    }
}

/// <summary>Pause, resume, extend, finish, end early, restart or change a recovery.</summary>
public sealed record ChangeRecoveryCommand(Guid Id, ChangeRecoveryRequest Change) : IRequest<RecoveryPlanDto>;

internal sealed class ChangeRecoveryValidator : AbstractValidator<ChangeRecoveryCommand>
{
    public ChangeRecoveryValidator()
    {
        RuleFor(c => c.Change).NotNull();
        When(c => c.Change is not null, () =>
        {
            RuleFor(c => c.Change.Action).IsInEnum();
            RuleFor(c => c.Change.ExtendDays).NotNull().InclusiveBetween(1, RecoveryPlan.MaxExtendDays)
                .When(c => c.Change.Action == RecoveryAction.Extend);
            RuleFor(c => c.Change.Effort).IsInEnum().When(c => c.Change.Effort is not null);
            RuleFor(c => c.Change.Preference).IsInEnum().When(c => c.Change.Preference is not null);
            RuleForEach(c => c.Change.RunDays).IsInEnum();
            RuleFor(c => c.Change.ExpectedVersion).MaximumLength(64);
        });
    }
}

internal sealed class ChangeRecoveryHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time)
    : IRequestHandler<ChangeRecoveryCommand, RecoveryPlanDto>
{
    public async Task<RecoveryPlanDto> Handle(ChangeRecoveryCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var recovery = await OwnJourney.RecoveryAsync(db, runner, request.Id, cancellationToken);
        var change = request.Change;
        if (!JourneyVersion.Matches(change.ExpectedVersion, recovery.Version))
        {
            throw new ConflictException("recovery_changed", "Your recovery changed on another device. Load it again first.");
        }

        var today = CoachCalls.LocalToday(runner, time);
        var repeat = (change.Action, recovery.Status) is (RecoveryAction.Complete, RecoveryStatus.Completed) or (RecoveryAction.End, RecoveryStatus.Ended);
        if (!recovery.IsOpen && change.Action != RecoveryAction.Restart && !repeat)
        {
            throw new ConflictException("recovery_closed", "This recovery has finished. Restart it to carry on.");
        }

        switch (change.Action)
        {
            case RecoveryAction.Pause:
                recovery.Pause(today);
                break;
            case RecoveryAction.Resume:
                recovery.Resume(today);
                break;
            case RecoveryAction.Extend:
                recovery.Extend(change.ExtendDays!.Value);
                break;
            case RecoveryAction.Complete when !repeat && !recovery.Schedule(today).CanComplete:
                throw new ConflictException("recovery_not_ready", "Check in as \"Good to go\" before finishing your recovery.");
            case RecoveryAction.Complete:
                recovery.Complete(today);
                break;
            case RecoveryAction.End:
                recovery.End(today);
                break;
            case RecoveryAction.Restart:
                if (await db.RecoveryPlans.AnyAsync(x => x.RunnerId == runner.Id && x.Id != recovery.Id
                    && (x.Status == RecoveryStatus.Active || x.Status == RecoveryStatus.Paused), cancellationToken))
                {
                    throw new ConflictException("recovery_active", "You already have a recovery going. Finish or end it first.");
                }

                recovery.Restart(today);
                break;
            default:
                recovery.Update(change.Effort ?? recovery.Effort, change.Preference ?? recovery.Preference, change.RunDays ?? recovery.RunDays);
                break;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException e) when (e is not DbUpdateConcurrencyException && change.Action == RecoveryAction.Restart)
        {
            throw new ConflictException("recovery_active", "You already have a recovery going. Finish or end it first.");
        }

        return RecoveryPlanDto.From(recovery, today);
    }
}

/// <summary>How the runner feels today (or a day back to race day). Decides what the recovery allows from then on.</summary>
public sealed record RecoveryCheckInCommand(Guid Id, RecoveryCheckInRequest CheckIn) : IRequest<RecoveryPlanDto>;

internal sealed class RecoveryCheckInValidator : AbstractValidator<RecoveryCheckInCommand>
{
    public RecoveryCheckInValidator()
    {
        RuleFor(c => c.CheckIn).NotNull();
        When(c => c.CheckIn is not null, () =>
        {
            RuleFor(c => c.CheckIn.Feeling).IsInEnum();
            RuleForEach(c => c.CheckIn.RedFlags).IsInEnum();
            RuleFor(c => c.CheckIn.Note).MaximumLength(RecoveryPlan.MaxNoteLength);
        });
    }
}

internal sealed class RecoveryCheckInHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time)
    : IRequestHandler<RecoveryCheckInCommand, RecoveryPlanDto>
{
    public async Task<RecoveryPlanDto> Handle(RecoveryCheckInCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var recovery = await OwnJourney.RecoveryAsync(db, runner, request.Id, cancellationToken);
        if (!recovery.IsOpen)
        {
            throw new ConflictException("recovery_closed", "This recovery has finished. Restart it to check in again.");
        }

        var today = CoachCalls.LocalToday(runner, time);
        var c = request.CheckIn;
        recovery.CheckIn(c.Date ?? today, c.Feeling, c.RedFlags, c.Note, today);
        await db.SaveChangesAsync(cancellationToken);
        return RecoveryPlanDto.From(recovery, today);
    }
}
