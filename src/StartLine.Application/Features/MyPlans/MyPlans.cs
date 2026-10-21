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

/// <param name="ReplannedFrom">When the runner last rebuilt the plan after a setback, if they have.</param>
public sealed record SavedPlanSummaryDto(
    Guid Id, string Name, string RaceName, DateOnly? RaceDate, DateTimeOffset CreatedAt, SavedPlanStatus Status, DateOnly? ReplannedFrom = null);

public sealed record SavedPlanDto(Guid Id, string Name, DateTimeOffset CreatedAt, GeneratePlanQuery Inputs, TrainingPlanDto Plan, SavedPlanStatus Status);

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
        q.PlanFrom ?? planFrom,
        q.Setback is null ? null : q.ReplanFrom,
        q.ReplanFrom is null ? null : q.Setback,
        q.ReplanFrom is null || q.Setback is null ? null : q.RecentWeeklyKm);

    public static GeneratePlanQuery ToQuery(SavedPlanInputs i) => new(
        i.RaceSlug, i.RaceName, i.DistanceKm, i.RaceDate, i.GoalTime, i.RunDays, i.LongRunDay, i.CurrentWeeklyKm,
        i.Experience, i.StrengthDays, i.PlanFrom, i.ReplanFrom, i.Setback, i.RecentWeeklyKm);
}

/// <summary>
/// Saves the plan the runner just built as their current plan. Pinning PlanFrom keeps it stable over time. A runner has
/// one plan at a time: with one already, <see cref="ReplaceCurrent"/> must be set. The same race then updates the current
/// plan in place; a different race moves the current plan to the past plans.
/// </summary>
public sealed record SavePlanCommand(string? Name, GeneratePlanQuery Plan, bool ReplaceCurrent = false) : IRequest<SavedPlanSummaryDto>;

internal sealed class SavePlanValidator : AbstractValidator<SavePlanCommand>
{
    public SavePlanValidator(IRaceCatalogue catalogue, TimeProvider timeProvider)
    {
        RuleFor(c => c.Name).MaximumLength(SavedPlan.MaxNameLength);
        RuleFor(c => c.Plan).NotNull().SetValidator(new GeneratePlanValidator(catalogue, timeProvider));
    }
}

internal sealed class SavePlanHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, IRaceCatalogue catalogue, TimeProvider time)
    : IRequestHandler<SavePlanCommand, SavedPlanSummaryDto>
{
    public async Task<SavedPlanSummaryDto> Handle(SavePlanCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);

        // Build first: a plan that can't be generated must never be saved.
        var inputs = SavedPlanMapping.ToInputs(request.Plan, DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime));
        var plan = builder.Build(SavedPlanMapping.ToQuery(inputs));
        var name = string.IsNullOrWhiteSpace(request.Name) ? plan.Race.Name : request.Name;

        var active = await db.SavedPlans.SingleOrDefaultAsync(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active, cancellationToken);
        if (active is not null && !request.ReplaceCurrent)
        {
            throw new ConflictException("plan_active", $"Your current plan is {active.Name}. Replace it to make this your plan.");
        }

        if (active is not null && active.IsForSameRace(inputs))
        {
            active.Update(inputs);
            active.Rename(name);
            await db.SaveChangesAsync(cancellationToken);
            return SavedPlanSummaries.Of(active, catalogue);
        }

        if (await db.SavedPlans.CountAsync(p => p.RunnerId == runner.Id, cancellationToken) >= SavedPlan.MaxKeptPerRunner)
        {
            throw new ConflictException("plan_limit", $"You can keep up to {SavedPlan.MaxKeptPerRunner} plans. Delete a past plan to save another.");
        }

        var saved = SavedPlan.Create(runner.Id, name, inputs);
        if (active is not null)
        {
            active.Archive();

            // The archive goes first, or the one-current-plan index would see two at once.
            await db.SaveChangesAsync(cancellationToken);
        }

        db.SavedPlans.Add(saved);
        await db.SaveChangesAsync(cancellationToken);
        return SavedPlanSummaries.Of(saved, catalogue);
    }
}

internal static class SavedPlanSummaries
{
    public static SavedPlanSummaryDto Of(SavedPlan p, IRaceCatalogue catalogue)
    {
        var race = p.Inputs.RaceSlug is { } slug ? catalogue.FindBySlug(slug) : null;
        return new SavedPlanSummaryDto(p.Id, p.Name, race?.Name ?? p.Inputs.RaceName ?? "Your race", race?.Date ?? p.Inputs.RaceDate, p.CreatedAt, p.Status,
            p.Inputs.Replan?.From);
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

        // The current plan first, then past plans, newest first.
        var plans = await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runner.Id)
            .OrderBy(p => p.Status).ThenByDescending(p => p.UpdatedAt).ThenByDescending(p => p.Id)
            .Take(SavedPlan.MaxKeptPerRunner)
            .ToListAsync(cancellationToken);

        return [.. plans.Select(p => SavedPlanSummaries.Of(p, catalogue))];
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
        return new SavedPlanDto(saved.Id, saved.Name, saved.CreatedAt, query, builder.Build(query), saved.Status);
    }
}

/// <summary>Makes a past plan the current one again; the plan that was current becomes a past plan.</summary>
public sealed record RestoreMyPlanCommand(Guid Id) : IRequest<SavedPlanSummaryDto>;

internal sealed class RestoreMyPlanHandler(IApplicationDbContext db, CurrentRunner current, IRaceCatalogue catalogue)
    : IRequestHandler<RestoreMyPlanCommand, SavedPlanSummaryDto>
{
    public async Task<SavedPlanSummaryDto> Handle(RestoreMyPlanCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var plans = runner is null
            ? []
            : await db.SavedPlans.Where(p => p.RunnerId == runner.Id && (p.Id == request.Id || p.Status == SavedPlanStatus.Active)).ToListAsync(cancellationToken);
        var chosen = plans.SingleOrDefault(p => p.Id == request.Id) ?? throw new NotFoundException("Saved plan", request.Id.ToString());
        if (chosen.Status == SavedPlanStatus.Active)
        {
            return SavedPlanSummaries.Of(chosen, catalogue);
        }

        foreach (var other in plans.Where(p => p.Id != chosen.Id))
        {
            other.Archive();
        }

        // Archive first, then restore, so the one-current-plan index never sees two.
        await db.SaveChangesAsync(cancellationToken);
        chosen.Restore();
        await db.SaveChangesAsync(cancellationToken);
        return SavedPlanSummaries.Of(chosen, catalogue);
    }
}

/// <summary>
/// "Replan from here" for the current saved plan: the plan up to <see cref="ReplanFrom"/> stays and the rest is rebuilt
/// after <see cref="Setback"/>. Without a setback it undoes the replan. A plan keeps one replan; the latest wins.
/// </summary>
public sealed record ReplanMyPlanCommand(Guid Id, DateOnly? ReplanFrom, Setback? Setback, double? RecentWeeklyKm) : IRequest<SavedPlanDto>;

internal sealed class ReplanMyPlanValidator : AbstractValidator<ReplanMyPlanCommand>
{
    public ReplanMyPlanValidator(TimeProvider timeProvider)
    {
        RuleFor(c => c.Setback).IsInEnum();
        RuleFor(c => c.ReplanFrom).NotNull().When(c => c.Setback is not null).WithMessage("Say which day to replan from.");
        RuleFor(c => c.ReplanFrom)
            .Must(d => d <= timeProvider.Today().AddDays(1)).When(c => c.ReplanFrom is not null)
            .WithMessage("A plan is replanned from today, not from a day still to come.");
        RuleFor(c => c.RecentWeeklyKm).InclusiveBetween(0, 300).When(c => c.RecentWeeklyKm is not null);
        RuleFor(c => c.RecentWeeklyKm)
            .Must(km => km is > 0)
            .When(c => c.Setback == Setback.Behind)
            .WithMessage("Say how far you ran last week, so the plan can pick up from there.");
    }
}

internal sealed class ReplanMyPlanHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder)
    : IRequestHandler<ReplanMyPlanCommand, SavedPlanDto>
{
    public async Task<SavedPlanDto> Handle(ReplanMyPlanCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var saved = runner is null
            ? null
            : await db.SavedPlans.SingleOrDefaultAsync(p => p.Id == request.Id && p.RunnerId == runner.Id, cancellationToken);
        if (saved is null)
        {
            throw new NotFoundException("Saved plan", request.Id.ToString());
        }

        saved.Replan(request is { ReplanFrom: { } from, Setback: { } setback } ? new PlanReplan(from, setback, request.RecentWeeklyKm) : null);

        // Build first: a replan that can't be generated (the race too close, say) must never be saved.
        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        var plan = builder.Build(query);
        await db.SaveChangesAsync(cancellationToken);
        return new SavedPlanDto(saved.Id, saved.Name, saved.CreatedAt, query, plan, saved.Status);
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
