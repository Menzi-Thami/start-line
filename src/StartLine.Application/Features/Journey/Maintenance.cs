using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Domain.Journey;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Journey;

/// <summary>
/// "Keep running comfortably": starts easy running, or changes the easy running already going. Sending the same answers
/// again returns the same plan.
/// </summary>
public sealed record StartMaintenanceCommand(StartMaintenanceRequest Maintenance) : IRequest<MaintenancePlanDto>;

internal sealed class StartMaintenanceValidator : AbstractValidator<StartMaintenanceCommand>
{
    public StartMaintenanceValidator()
    {
        RuleFor(c => c.Maintenance).NotNull();
        When(c => c.Maintenance is not null, () =>
        {
            RuleFor(c => c.Maintenance.DaysPerWeek).InclusiveBetween(MaintenanceGenerator.MinDaysPerWeek, MaintenanceGenerator.MaxDaysPerWeek);
            RuleForEach(c => c.Maintenance.RunDays).IsInEnum();
            RuleFor(c => c.Maintenance.RunDays)
                .Must((c, days) => days is null || days.Count == 0 || days.Distinct().Count() >= c.Maintenance.DaysPerWeek)
                .WithMessage(c => $"Choose at least {c.Maintenance.DaysPerWeek} days to run on.");
        });
    }
}

internal sealed class StartMaintenanceHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time)
    : IRequestHandler<StartMaintenanceCommand, MaintenancePlanDto>
{
    public async Task<MaintenancePlanDto> Handle(StartMaintenanceCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var today = CoachCalls.LocalToday(runner, time);
        var m = request.Maintenance;
        // Without days chosen, the days of the runner's last plan.
        var fallback = await db.SavedPlans.AsNoTracking().Where(p => p.RunnerId == runner.Id)
            .OrderBy(p => p.Status).ThenByDescending(p => p.UpdatedAt)
            .Select(p => p.Inputs.RunDays)
            .FirstOrDefaultAsync(cancellationToken);

        var active = await db.MaintenancePlans.SingleOrDefaultAsync(x => x.RunnerId == runner.Id && x.Status == MaintenanceStatus.Active, cancellationToken);
        if (active is not null)
        {
            if (!active.IsSameAs(m.DaysPerWeek, m.RunDays, m.IncludeStrength, fallback))
            {
                active.Change(m.DaysPerWeek, m.RunDays, m.IncludeStrength, fallback);
                await db.SaveChangesAsync(cancellationToken);
            }

            return MaintenancePlanDto.From(active, today);
        }

        var plan = MaintenancePlan.Start(runner.Id, m.DaysPerWeek, m.RunDays, m.IncludeStrength, fallback, today);
        db.MaintenancePlans.Add(plan);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Started twice at once: the first one is the plan.
            db.MaintenancePlans.Entry(plan).State = EntityState.Detached;
            var first = await db.MaintenancePlans.AsNoTracking().SingleOrDefaultAsync(x => x.RunnerId == runner.Id && x.Status == MaintenanceStatus.Active, cancellationToken);
            if (first is null)
            {
                throw;
            }

            return MaintenancePlanDto.From(first, today);
        }

        return MaintenancePlanDto.From(plan, today);
    }
}

/// <summary>Stops easy running. Stopping when none is going is fine.</summary>
public sealed record EndMaintenanceCommand : IRequest<bool>;

internal sealed class EndMaintenanceHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time) : IRequestHandler<EndMaintenanceCommand, bool>
{
    public async Task<bool> Handle(EndMaintenanceCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var active = await db.MaintenancePlans.SingleOrDefaultAsync(x => x.RunnerId == runner.Id && x.Status == MaintenanceStatus.Active, cancellationToken);
        if (active is not null)
        {
            active.End(CoachCalls.LocalToday(runner, time));
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }
}
