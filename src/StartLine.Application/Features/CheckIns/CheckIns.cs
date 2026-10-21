using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
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
    DateTimeOffset UpdatedAt)
{
    public static CheckInDto From(SessionCheckIn c)
    {
        ArgumentNullException.ThrowIfNull(c);
        return new(c.Date, c.SessionType, c.Status, c.Effort, c.Pain, c.PainArea, c.DistanceKm, c.Duration, c.Note, c.UpdatedAt);
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
    string? Note = null) : IRequest<CheckInDto>;

internal sealed class SaveCheckInValidator : AbstractValidator<SaveCheckInCommand>
{
    public SaveCheckInValidator(TimeProvider timeProvider)
    {
        // A day of slack for time zones ahead of UTC, as with the plan's own date.
        RuleFor(c => c.Date).Must(d => d <= timeProvider.Today().AddDays(1)).WithMessage("You can check in on a run once its day has come.");
        RuleFor(c => c.SessionType).IsInEnum().Must(SessionCheckIn.IsCheckable).WithMessage("Only runs can be checked in on.");
        RuleFor(c => c.Status).IsInEnum();
        RuleFor(c => c.Pain).IsInEnum();
        RuleFor(c => c.PainArea).IsInEnum();
        RuleFor(c => c.Effort).NotNull().When(c => c.Status != CheckInStatus.Skipped).WithMessage("Say how hard it felt, from 1 to 10.");
        RuleFor(c => c.Effort).InclusiveBetween(SessionCheckIn.MinEffort, SessionCheckIn.MaxEffort).When(c => c.Effort is not null);
        RuleFor(c => c.DistanceKm).GreaterThan(0).LessThanOrEqualTo(SessionCheckIn.MaxDistanceKm).When(c => c.DistanceKm is not null);
        RuleFor(c => c.Duration).Must(d => d > TimeSpan.Zero && d <= SessionCheckIn.MaxDuration).When(c => c.Duration is not null)
            .WithMessage("The time must be more than zero and under 30 hours.");
        RuleFor(c => c.Note).MaximumLength(SessionCheckIn.MaxNoteLength);
    }
}

internal sealed class SaveCheckInHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder)
    : IRequestHandler<SaveCheckInCommand, CheckInDto>
{
    public async Task<CheckInDto> Handle(SaveCheckInCommand request, CancellationToken cancellationToken)
    {
        var plan = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        if (plan.Status != SavedPlanStatus.Active)
        {
            throw new ConflictException("plan_archived", "This is a past plan. Make it your plan again to check in on its runs.");
        }

        var sessions = builder.BuildPlan(SavedPlanMapping.ToQuery(plan.Inputs)).Weeks.SelectMany(w => w.Sessions);
        if (!sessions.Any(s => s.Date == request.Date && s.Type == request.SessionType))
        {
            throw new DomainException("That run isn't in your plan on that day. Your plan may have changed: reload it and try again.");
        }

        var answers = new CheckInAnswers(request.Status, request.Effort, request.Pain, request.PainArea, request.DistanceKm, request.Duration, request.Note);
        var checkIn = await db.SessionCheckIns.SingleOrDefaultAsync(
            c => c.SavedPlanId == plan.Id && c.Date == request.Date && c.SessionType == request.SessionType, cancellationToken);
        if (checkIn is null)
        {
            checkIn = SessionCheckIn.Create(plan.Id, request.Date, request.SessionType, answers);
            db.SessionCheckIns.Add(checkIn);
        }
        else
        {
            checkIn.Answer(answers);
        }

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
            c => c.SavedPlanId == plan.Id && c.Date == request.Date && c.SessionType == request.SessionType, cancellationToken);
        if (checkIn is not null)
        {
            db.SessionCheckIns.Remove(checkIn);
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }
}
