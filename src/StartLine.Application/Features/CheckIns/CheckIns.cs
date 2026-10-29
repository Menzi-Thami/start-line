using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.CheckIns;

public sealed record CheckInDto(
    DateOnly Date,
    SessionType SessionType,
    CheckInStatus Status,
    int? Effort,
    PainLevel Pain,
    BodyArea? PainArea,
    double? DistanceKm,
    TimeSpan? Duration,
    string? Note,
    DateTimeOffset UpdatedAt,
    Guid? Id = null,
    SessionType? ActualSessionType = null,
    bool DistanceUnreported = false,
    Guid? ActivityId = null,
    bool IsAdditional = false,
    double? PrescribedKm = null)
{
    public static CheckInDto From(SessionCheckIn c)
    {
        ArgumentNullException.ThrowIfNull(c);
        return new(c.Date, c.SessionType, c.Status, c.Effort, c.Pain, c.PainArea, c.DistanceKm, c.Duration, c.Note, c.UpdatedAt, c.Id, c.ActualSessionType, c.DistanceUnreported, c.ActivityId, c.IsAdditional, c.PrescribedKm);
    }
}

/// <summary>A check-in as exported with the account: which plan it was for, then the answers.</summary>
public sealed record CheckInExportDto(Guid PlanId, CheckInDto CheckIn);

/// <summary>Finds the runner's own saved plan, or says it isn't there: someone else's plan is never "forbidden".</summary>
internal static class OwnPlan
{
    public static async Task<SavedPlan> FindAsync(IApplicationDbContext db, CurrentRunner current, Guid planId, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var plan = runner is null
            ? null
            : await db.SavedPlans.AsNoTracking().SingleOrDefaultAsync(p => p.Id == planId && p.RunnerId == runner.Id, cancellationToken);
        return plan ?? throw new NotFoundException("Saved plan", planId.ToString());
    }
}

/// <summary>The sessions of a saved plan a check-in can be on.</summary>
internal static class PlanSessions
{
    /// <summary>
    /// The session on that day, from the plan as the coach has it: a step down turns a hard session into an easy run, and
    /// that's what was run. Throws <see cref="DomainException"/> when there's no such run that day.
    /// </summary>
    public static async Task<PlannedSession> RequireAsync(
        IApplicationDbContext db, PlanBuilder builder, SavedPlan plan, DateOnly date, SessionType type, CancellationToken cancellationToken)
    {
        var calls = await CoachCalls.ForAsync(db, plan.Id, cancellationToken);
        var sessions = builder.BuildPlan(SavedPlanMapping.ToQuery(plan.Inputs), calls, plan.Adjustments, date).Weeks.SelectMany(w => w.Sessions);
        return sessions.FirstOrDefault(s => s.Date == date && s.Type == type)
            ?? throw new DomainException("That run isn't in your plan on that day. Your plan may have changed: reload it and try again.");
    }
}

/// <summary>Every check-in on one of the runner's saved plans, oldest first.</summary>
public sealed record ListCheckInsQuery(Guid PlanId) : IRequest<IReadOnlyList<CheckInDto>>;

internal sealed class ListCheckInsHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<ListCheckInsQuery, IReadOnlyList<CheckInDto>>
{
    public async Task<IReadOnlyList<CheckInDto>> Handle(ListCheckInsQuery request, CancellationToken cancellationToken)
    {
        var plan = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == plan.Id)
            .OrderBy(c => c.Date).ThenBy(c => c.SessionType)
            .ToListAsync(cancellationToken);
        return [.. checkIns.Select(CheckInDto.From)];
    }
}

/// <summary>
/// The runner's answers for one planned run: saved, or replaced if they already checked in on it. The session must be
/// a run in the plan on that day, on a day that has come. Past plans are read-only.
/// </summary>
public sealed record SaveCheckInCommand(
    Guid PlanId,
    DateOnly Date,
    SessionType SessionType,
    CheckInStatus Status,
    int? Effort,
    PainLevel Pain = PainLevel.None,
    BodyArea? PainArea = null,
    double? DistanceKm = null,
    TimeSpan? Duration = null,
    string? Note = null,
    SessionType? ActualSessionType = null,
    bool DistanceUnreported = false,
    Guid? ActivityId = null,
    Guid? EntryId = null, bool IndependentMetrics = false) : IRequest<CheckInDto>;

internal sealed class SaveCheckInValidator : AbstractValidator<SaveCheckInCommand>
{
    public SaveCheckInValidator(TimeProvider timeProvider)
    {
        // A day of slack for time zones ahead of UTC, as with the plan's own date.
        RuleFor(c => c.Date).Must(d => d <= timeProvider.Today().AddDays(1)).WithMessage("You can check in on a run once its day has come.");
        RuleFor(c => c.SessionType).IsInEnum().Must(SessionCheckIn.IsCheckable).WithMessage("Only runs can be checked in on.");
        RuleFor(c => c.ActualSessionType).IsInEnum();
        RuleFor(c => c.Status).IsInEnum();
        RuleFor(c => c.Pain).IsInEnum();
        RuleFor(c => c.PainArea).IsInEnum();
        // "Done" alone is a tick, and may say how it felt later. A run cut short or swapped always says.
        RuleFor(c => c.Effort).NotNull().When(c => c.Status is not (CheckInStatus.Skipped or CheckInStatus.Done)).WithMessage("Say how hard it felt, from 1 to 10.");
        RuleFor(c => c.Effort).InclusiveBetween(SessionCheckIn.MinEffort, SessionCheckIn.MaxEffort).When(c => c.Effort is not null);
        RuleFor(c => c.DistanceKm).GreaterThan(0).LessThanOrEqualTo(SessionCheckIn.MaxDistanceKm).When(c => c.DistanceKm is not null);
        RuleFor(c => c.Duration).Must(d => d > TimeSpan.Zero && d <= SessionCheckIn.MaxDuration).When(c => c.Duration is not null)
            .WithMessage("The time must be more than zero and under 30 hours.");
        RuleFor(c => c.Note).MaximumLength(SessionCheckIn.MaxNoteLength);
    }
}

internal sealed class SaveCheckInHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
    : IRequestHandler<SaveCheckInCommand, CheckInDto>
{
    public async Task<CheckInDto> Handle(SaveCheckInCommand request, CancellationToken cancellationToken)
    {
        var plan = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        if (plan.Status != SavedPlanStatus.Active)
        {
            throw new ConflictException("plan_archived", "This is a past plan. Make it your plan again to check in on its runs.");
        }

        var additional = request.EntryId is not null;
        var checkIn = additional
            ? await db.SessionCheckIns.SingleOrDefaultAsync(c => c.Id == request.EntryId && c.SavedPlanId == plan.Id && c.IsAdditional, cancellationToken)
            : await db.SessionCheckIns.SingleOrDefaultAsync(c => c.SavedPlanId == plan.Id && c.Date == request.Date && c.SessionType == request.SessionType && !c.IsAdditional, cancellationToken);
        PlannedSession? prescribed = null;
        if (additional)
        {
            if (request.EntryId == Guid.Empty || request.Status == CheckInStatus.Skipped ||
                (request.DistanceKm is null && request.Duration is null && request.ActivityId is null))
            {
                throw new DomainException("An additional run needs a distance, a time or an imported activity.");
            }

            if (checkIn is null)
            {
                var built = builder.BuildPlan(SavedPlanMapping.ToQuery(plan.Inputs));
                if (request.Date < built.StartDate || request.Date > built.RaceDate)
                    throw new DomainException("Choose a day within this plan for your additional run.");
            }
        }
        else if (checkIn is null)
        {
            prescribed = await PlanSessions.RequireAsync(db, builder, plan, request.Date, request.SessionType, cancellationToken);
        }

        if (request.ActivityId is not null && (request.DistanceKm is not null || request.Duration is not null) && !request.IndependentMetrics)
            throw new DomainException("Link the imported run without copying its metrics, or explicitly enter your own measurements.");

        if (request.ActivityId is { } activityId)
        {
            var activity = await db.Activities.AsNoTracking().Visible(time.GetUtcNow())
                .SingleOrDefaultAsync(a => a.Id == activityId && a.RunnerId == plan.RunnerId, cancellationToken)
                ?? throw new NotFoundException("Activity", activityId.ToString());
            if (activity.LocalDate != request.Date)
            {
                throw new DomainException("Choose an imported run from the same day.");
            }

            if (await db.SessionCheckIns.AnyAsync(c => c.SavedPlanId == plan.Id && c.ActivityId == activityId &&
                (additional ? c.Id != request.EntryId : c.IsAdditional || c.Date != request.Date || c.SessionType != request.SessionType), cancellationToken))
            {
                throw new ConflictException("run_already_logged", "That imported run is already logged. Change or remove its existing entry first.");
            }
        }

        var answers = new CheckInAnswers(request.Status, request.Effort, request.Pain, request.PainArea, request.DistanceKm,
            request.Duration, request.Note, request.ActualSessionType, request.DistanceUnreported, request.ActivityId);
        if (checkIn is null)
        {
            if (additional && await db.SessionCheckIns.AnyAsync(c => c.Id == request.EntryId, cancellationToken))
            {
                throw new NotFoundException("Run entry", request.EntryId.ToString()!);
            }

            if (additional && await db.SessionCheckIns.CountAsync(c => c.SavedPlanId == plan.Id && c.IsAdditional, cancellationToken) >= 1000)
            {
                throw new ConflictException("run_limit", "This plan already has 1,000 additional runs.");
            }

            checkIn = additional
                ? SessionCheckIn.CreateAdditional(request.EntryId!.Value, plan.Id, request.Date, request.SessionType, answers)
                : SessionCheckIn.Create(plan.Id, request.Date, request.SessionType, answers);
            db.SessionCheckIns.Add(checkIn);
        }
        else
        {
            if (additional && (checkIn.Date != request.Date || checkIn.SessionType != request.SessionType))
            {
                throw new ConflictException("run_entry_changed", "Remove this entry before changing its day.");
            }

            checkIn.Answer(answers);
        }

        if (prescribed is not null)
            checkIn.RememberPrescription(prescribed.DistanceKm);
        await db.SaveChangesAsync(cancellationToken);
        return CheckInDto.From(checkIn);
    }
}

/// <summary>Takes a check-in back. Nothing to take back is fine: the result is the same.</summary>
public sealed record DeleteCheckInCommand(Guid PlanId, DateOnly Date, SessionType SessionType) : IRequest<bool>;

internal sealed class DeleteCheckInHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteCheckInCommand, bool>
{
    public async Task<bool> Handle(DeleteCheckInCommand request, CancellationToken cancellationToken)
    {
        var plan = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        var checkIn = await db.SessionCheckIns.SingleOrDefaultAsync(
            c => c.SavedPlanId == plan.Id && c.Date == request.Date && c.SessionType == request.SessionType && !c.IsAdditional, cancellationToken);
        if (checkIn is not null)
        {
            db.SessionCheckIns.Remove(checkIn);
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }
}

/// <summary>Removes only an additional run owned by this plan's runner.</summary>
public sealed record DeleteAdditionalRunCommand(Guid PlanId, Guid Id) : IRequest<bool>;

internal sealed class DeleteAdditionalRunHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteAdditionalRunCommand, bool>
{
    public async Task<bool> Handle(DeleteAdditionalRunCommand request, CancellationToken cancellationToken)
    {
        var plan = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        var entry = await db.SessionCheckIns.SingleOrDefaultAsync(c => c.SavedPlanId == plan.Id && c.Id == request.Id && c.IsAdditional, cancellationToken);
        if (entry is not null)
        {
            db.SessionCheckIns.Remove(entry);
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }
}
