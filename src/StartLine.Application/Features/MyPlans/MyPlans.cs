using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.MyPlans;

public sealed record SavedPlanSummaryDto(Guid Id, string Name, string RaceName, DateOnly? RaceDate, DateTimeOffset CreatedAt);

public sealed record SavedPlanDto(Guid Id, string Name, DateTimeOffset CreatedAt, GeneratePlanQuery Inputs, TrainingPlanDto Plan);

public sealed record SavedPlanExportDto(Guid Id, string Name, SavedPlanStatus Status, DateTimeOffset CreatedAt, GeneratePlanQuery Inputs)
{
    public static SavedPlanExportDto From(SavedPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);
        return new(plan.Id, plan.Name, plan.Status, plan.CreatedAt, SavedPlanMapping.ToQuery(plan.Inputs));
    }
}

internal static class SavedPlanMapping
{
    public static SavedPlanInputs ToInputs(GeneratePlanQuery q, DateOnly planFrom) => new(
        string.IsNullOrWhiteSpace(q.RaceSlug) ? null : q.RaceSlug.Trim(),
        string.IsNullOrWhiteSpace(q.RaceSlug) ? q.RaceName?.Trim() : null,
        string.IsNullOrWhiteSpace(q.RaceSlug) ? q.DistanceKm : null,
        string.IsNullOrWhiteSpace(q.RaceSlug) ? q.RaceDate : null,
        q.GoalTime,
        [.. q.RunDays.Distinct()],
        q.LongRunDay,
        q.CurrentWeeklyKm,
        q.Experience,
        [.. (q.StrengthDays ?? []).Distinct()],
        q.PlanFrom ?? planFrom);

    public static GeneratePlanQuery ToQuery(SavedPlanInputs i) => new(
        i.RaceSlug, i.RaceName, i.DistanceKm, i.RaceDate, i.GoalTime, i.RunDays, i.LongRunDay, i.CurrentWeeklyKm,
        i.Experience, i.StrengthDays, i.PlanFrom);
}

/// <summary>Saves the plan the runner just built. Pinning PlanFrom keeps the saved plan stable over time.</summary>
public sealed record SavePlanCommand(string? Name, GeneratePlanQuery Plan) : IRequest<SavedPlanSummaryDto>;

internal sealed class SavePlanValidator : AbstractValidator<SavePlanCommand>
{
    public SavePlanValidator(IRaceCatalogue catalogue, TimeProvider timeProvider)
    {
        RuleFor(c => c.Name).MaximumLength(SavedPlan.MaxNameLength);
        RuleFor(c => c.Plan).NotNull().SetValidator(new GeneratePlanValidator(catalogue, timeProvider));
    }
}

internal sealed class SavePlanHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
    : IRequestHandler<SavePlanCommand, SavedPlanSummaryDto>
{
    public async Task<SavedPlanSummaryDto> Handle(SavePlanCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);

        var active = await db.SavedPlans.CountAsync(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active, cancellationToken);
        if (active >= SavedPlan.MaxActivePerRunner)
        {
            throw new ConflictException("plan_limit", $"You can keep up to {SavedPlan.MaxActivePerRunner} plans. Delete one to save another.");
        }

        // Build first: a plan that can't be generated must never be saved.
        var inputs = SavedPlanMapping.ToInputs(request.Plan, DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime));
        var plan = builder.Build(SavedPlanMapping.ToQuery(inputs));

        var saved = SavedPlan.Create(runner.Id, string.IsNullOrWhiteSpace(request.Name) ? plan.Race.Name : request.Name, inputs);
        db.SavedPlans.Add(saved);
        await db.SaveChangesAsync(cancellationToken);
        return new SavedPlanSummaryDto(saved.Id, saved.Name, plan.Race.Name, plan.Race.Date, saved.CreatedAt);
    }
}

public sealed record ListMyPlansQuery : IRequest<IReadOnlyList<SavedPlanSummaryDto>>;

internal sealed class ListMyPlansHandler(IApplicationDbContext db, CurrentRunner current, IRaceCatalogue catalogue)
    : IRequestHandler<ListMyPlansQuery, IReadOnlyList<SavedPlanSummaryDto>>
{
    public async Task<IReadOnlyList<SavedPlanSummaryDto>> Handle(ListMyPlansQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            return [];
        }

        var plans = await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active)
            .OrderByDescending(p => p.UpdatedAt).ThenByDescending(p => p.Id)
            .Take(SavedPlan.MaxActivePerRunner)
            .ToListAsync(cancellationToken);

        return [.. plans.Select(p =>
        {
            var race = p.Inputs.RaceSlug is { } slug ? catalogue.FindBySlug(slug) : null;
            return new SavedPlanSummaryDto(p.Id, p.Name, race?.Name ?? p.Inputs.RaceName ?? "Your race", race?.Date ?? p.Inputs.RaceDate, p.CreatedAt);
        })];
    }
}

public sealed record GetMyPlanQuery(Guid Id) : IRequest<SavedPlanDto>;

internal sealed class GetMyPlanHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder)
    : IRequestHandler<GetMyPlanQuery, SavedPlanDto>
{
    public async Task<SavedPlanDto> Handle(GetMyPlanQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        // Someone else's plan is "not found", never "forbidden": the API must not confirm it exists.
        var saved = runner is null
            ? null
            : await db.SavedPlans.AsNoTracking()
                .SingleOrDefaultAsync(p => p.Id == request.Id && p.RunnerId == runner.Id, cancellationToken);
        if (saved is null)
        {
            throw new NotFoundException("Saved plan", request.Id.ToString());
        }

        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        return new SavedPlanDto(saved.Id, saved.Name, saved.CreatedAt, query, builder.Build(query));
    }
}

public sealed record DeleteMyPlanCommand(Guid Id) : IRequest<bool>;

internal sealed class DeleteMyPlanHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteMyPlanCommand, bool>
{
    public async Task<bool> Handle(DeleteMyPlanCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var saved = runner is null
            ? null
            : await db.SavedPlans.SingleOrDefaultAsync(p => p.Id == request.Id && p.RunnerId == runner.Id, cancellationToken);
        if (saved is null)
        {
            throw new NotFoundException("Saved plan", request.Id.ToString());
        }

        db.SavedPlans.Remove(saved);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
