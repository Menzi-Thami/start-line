using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Coaching;

/// <summary>A Life Happens preview: the changes, the safe days for a move, and the plan as it would be.</summary>
public sealed record LifeProposalDto(string Token, IReadOnlyList<SessionRevision> Changes, IReadOnlyList<DateOnly> MoveTargets, TrainingPlanDto Proposed);

/// <summary>
/// Previews what a situation would change on the runner's current plan, or with <paramref name="AcceptToken"/> applies
/// exactly the preview they saw. Nothing changes without that token, and a changed plan or new check-in asks for a new preview.
/// </summary>
public sealed record LifeHappensCommand(Guid Id, LifeChange Change, string? AcceptToken = null) : IRequest<LifeProposalDto>;

internal sealed class LifeHappensHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
    : IRequestHandler<LifeHappensCommand, LifeProposalDto>
{
    public async Task<LifeProposalDto> Handle(LifeHappensCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request.Change);
        var saved = await OwnPlan.FindAsync(db, current, request.Id, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        if (saved.Status != SavedPlanStatus.Active) throw new ConflictException("plan_archived", "Only your current plan can change.");
        var today = CoachCalls.LocalToday(runner, time);
        var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        var plan = Domain.Plans.RemainingWeek.Apply(builder.BuildPlan(query, calls, paceDate: today), saved.Adjustments);
        var from = today.AddDays(-7);
        var entries = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date < today.AddDays(Domain.Plans.LifeHappens.HorizonDays))
            .OrderBy(c => c.Id).ToListAsync(cancellationToken);
        var proposal = Domain.Plans.LifeHappens.Propose(plan, today, request.Change, entries);
        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            today,
            saved.Version,
            saved.Adjustments,
            calls,
            proposal.Changes,
            entries = entries.Select(c => new { c.Id, c.Date, c.SessionType, c.IsAdditional, c.Answers }),
        }))));

        if (request.AcceptToken is not null)
        {
            if (request.AcceptToken != token || proposal.Changes.Count == 0)
                throw new ConflictException("life_change_changed", "Your plan or running has changed. Preview it again before applying.");
            db.SavedPlans.Attach(saved);
            saved.ApplyLifeChange(proposal.Changes, today);
            await db.SaveChangesAsync(cancellationToken);
        }

        // The preview shows the plan as it would be; nothing is saved until it's applied.
        var proposed = request.AcceptToken is null ? [.. saved.Adjustments, .. proposal.Changes] : saved.Adjustments;
        return new(token, proposal.Changes, proposal.MoveTargets, builder.Build(query, calls, proposed, today));
    }
}

/// <summary>Puts upcoming days back as the plan first wrote them: the undo for Life Happens and eased weeks.</summary>
public sealed record RestoreSessionsCommand(Guid Id, IReadOnlyList<DateOnly> Dates) : IRequest<SavedPlanDto>;

internal sealed class RestoreSessionsHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, PlanCoach coach, TimeProvider time)
    : IRequestHandler<RestoreSessionsCommand, SavedPlanDto>
{
    public const int MaxDates = 14;

    public async Task<SavedPlanDto> Handle(RestoreSessionsCommand request, CancellationToken cancellationToken)
    {
        if (request.Dates is not { Count: > 0 and <= MaxDates })
            throw new ValidationException(new Dictionary<string, string[]> { ["dates"] = [$"Choose 1 to {MaxDates} days to restore."] });
        var saved = await OwnPlan.FindAsync(db, current, request.Id, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var today = CoachCalls.LocalToday(runner, time);
        db.SavedPlans.Attach(saved);
        saved.RestoreOriginal(request.Dates, today);
        await db.SaveChangesAsync(cancellationToken);
        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        var calls = await coach.CallsAsync(saved, runner, cancellationToken);
        return new SavedPlanDto(saved.Id, saved.Name, saved.CreatedAt, query, builder.Build(query, calls, saved.Adjustments, today), saved.Status,
            [.. calls.Select(CoachNoteDto.From)]);
    }
}
