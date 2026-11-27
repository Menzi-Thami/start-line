using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.PrivatePlans;

public sealed record PrivateImportRequest(string Name, GeneratePlanQuery Baseline, PrivatePrescription Prescription);
public sealed record PrivateImportPreviewDto(Guid ImportId, string Token, DateTimeOffset ExpiresAt, bool ReplacesCurrent, TrainingPlanDto Plan);
public sealed record PreviewPrivateImportCommand(PrivateImportRequest Import) : IRequest<PrivateImportPreviewDto>;
public sealed record ActivatePrivateImportCommand(Guid ImportId, string Token, bool ConsentToReplace) : IRequest<Guid>;
public sealed record PrivateGymCommand(Guid PlanId, Guid SessionId, bool Done, int? Effort) : IRequest<TrainingPlanDto>;
public sealed record MovePrivateGymCommand(Guid PlanId, Guid SessionId, DateOnly? Target, string? AcceptToken = null) : IRequest<PrivateGymMoveDto>;
public sealed record PrivateGymMoveDto(string Token, TrainingPlanDto Proposed);
public sealed record PrivateAccessQuery : IRequest<bool>;

/// <summary>One transaction owns archive, activation and idempotency, including the no-current-plan race.</summary>
public interface IPrivatePlanActivation
{
    Task<Guid> ActivateAsync(Guid runnerId, Guid importId, string tokenHash, bool consent, DateOnly today, DateTimeOffset now, CancellationToken cancellationToken);
}

internal static class PrivateTokens
{
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

internal sealed class PrivateAccessHandler(CurrentRunner current) : IRequestHandler<PrivateAccessQuery, bool>
{
    public async Task<bool> Handle(PrivateAccessQuery request, CancellationToken cancellationToken) =>
        (await current.FindAsync(cancellationToken))?.PrivatePrescriptionsEnabled == true;
}

internal sealed class PreviewPrivateImportHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, IRaceCatalogue catalogue, TimeProvider time)
    : IRequestHandler<PreviewPrivateImportCommand, PrivateImportPreviewDto>
{
    public async Task<PrivateImportPreviewDto> Handle(PreviewPrivateImportCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        if (!runner.PrivatePrescriptionsEnabled) throw new NotFoundException("Private import", "pilot");
        var input = request.Import;
        if (input is null || input.Baseline is null || input.Prescription is null || string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > SavedPlan.MaxNameLength)
            throw new Domain.Common.DomainException("Provide a name, baseline and prescription.");
        var query = input.Baseline;
        var validator = new GeneratePlanValidator(catalogue, time);
        var validation = await validator.ValidateAsync(query, cancellationToken);
        if (!validation.IsValid)
            throw new ValidationException(validation.Errors.GroupBy(e => e.PropertyName).ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray()));
        var today = CoachCalls.LocalToday(runner, time);
        if (query.PlanFrom != today || query.StartOn is null || query.ReplanFrom is not null || query.Setback is not null || query.RaceSlug is not null)
            throw new Domain.Common.DomainException("Use today's local planFrom, an explicit startOn and a custom race snapshot, without a replan.");
        var baseline = builder.BuildPlan(query);
        input.Prescription.Validate(baseline, today);
        var inputs = SavedPlanMapping.ToInputs(query, today, builder.Build(query).Race);
        var active = await db.SavedPlans.AsNoTracking().SingleOrDefaultAsync(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active, cancellationToken);
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var draft = PrivatePlanImport.Create(runner.Id, input.Name.Trim(), inputs, input.Prescription, active, PrivateTokens.Hash(token), today, time.GetUtcNow());
        // Expired, unactivated previews are no longer needed; activation keeps the actual plan's history.
        var expired = await db.PrivatePlanImports.Where(i => i.RunnerId == runner.Id && i.ExpiresAt < time.GetUtcNow() && i.ActivatedPlanId == null).ToListAsync(cancellationToken);
        db.PrivatePlanImports.RemoveRange(expired);
        var drafts = await db.PrivatePlanImports.Where(i => i.RunnerId == runner.Id && i.ExpiresAt >= time.GetUtcNow() && i.ActivatedPlanId == null)
            .OrderByDescending(i => i.ExpiresAt).ThenBy(i => i.Id).Skip(4).ToListAsync(cancellationToken);
        db.PrivatePlanImports.RemoveRange(drafts);
        db.PrivatePlanImports.Add(draft);
        await db.SaveChangesAsync(cancellationToken);
        var preview = SavedPlan.CreatePrivate(runner.Id, draft.Name, inputs, input.Prescription);
        return new(draft.Id, token, draft.ExpiresAt, active is not null, builder.Build(preview));
    }
}

internal sealed class ActivatePrivateImportHandler(CurrentRunner current, IPrivatePlanActivation activation, TimeProvider time)
    : IRequestHandler<ActivatePrivateImportCommand, Guid>
{
    public async Task<Guid> Handle(ActivatePrivateImportCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        if (!runner.PrivatePrescriptionsEnabled) throw new NotFoundException("Private import", "pilot");
        if (request.Token is not { Length: 64 }) throw new NotFoundException("Private import", "preview");
        return await activation.ActivateAsync(runner.Id, request.ImportId, PrivateTokens.Hash(request.Token), request.ConsentToReplace,
            CoachCalls.LocalToday(runner, time), time.GetUtcNow(), cancellationToken);
    }
}

internal sealed class PrivateGymHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time) : IRequestHandler<PrivateGymCommand, TrainingPlanDto>
{
    public async Task<TrainingPlanDto> Handle(PrivateGymCommand request, CancellationToken cancellationToken)
    {
        var saved = await Features.CheckIns.OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        if (saved.Prescription is null) throw new NotFoundException("Gym session", "private");
        var runner = await current.RequireAsync(cancellationToken);
        db.SavedPlans.Attach(saved);
        saved.CompleteGym(request.SessionId, request.Effort, request.Done, CoachCalls.LocalToday(runner, time), time.GetUtcNow());
        await db.SaveChangesAsync(cancellationToken);
        return builder.Build(saved);
    }
}

internal sealed class MovePrivateGymHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time) : IRequestHandler<MovePrivateGymCommand, PrivateGymMoveDto>
{
    public async Task<PrivateGymMoveDto> Handle(MovePrivateGymCommand request, CancellationToken cancellationToken)
    {
        var saved = await Features.CheckIns.OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        if (saved.Prescription is null) throw new NotFoundException("Gym session", "private");
        var runner = await current.RequireAsync(cancellationToken);
        var today = CoachCalls.LocalToday(runner, time);
        var token = PrivateTokens.Hash(JsonSerializer.Serialize(new { today, saved.Version, request.SessionId, request.Target }));
        if (request.AcceptToken is not null && request.AcceptToken != token)
            throw new ConflictException("private_gym_changed", "Your plan changed. Preview the gym move again.");
        db.SavedPlans.Attach(saved);
        saved.MoveGym(request.SessionId, request.Target, today);
        var moved = saved.Prescription with { Sessions = [.. saved.Prescription.Sessions.Select(s => saved.GymMoves.SingleOrDefault(m => m.SessionId == s.Id) is { } move ? s with { Date = move.Date } : s)] };
        var baseline = builder.BuildPlan(SavedPlanMapping.ToQuery(saved));
        moved.Validate(baseline, baseline.StartDate);
        if (request.AcceptToken is not null) await db.SaveChangesAsync(cancellationToken);
        return new(token, builder.Build(saved));
    }
}
