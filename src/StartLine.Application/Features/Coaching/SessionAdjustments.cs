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
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Coaching;

/// <summary>
/// One side of a before/after comparison: the run, its pace for its main zone, and about how long it takes at the middle of
/// that pace. <c>Steps</c> is how the run is followed on the day, so a kept long run shows its run/walk and any change of pace.
/// </summary>
public sealed record AdjustedSessionDto(
    DateOnly Date,
    SessionType Type,
    string Title,
    double DistanceKm,
    PaceZone? Zone,
    double? FastestSecondsPerKm,
    double? SlowestSecondsPerKm,
    int EstimatedMinutes,
    IReadOnlyList<SessionStepDto> Steps);

/// <summary>
/// The checked answer to an exact change: what the rules decided and why, the run before and after (no after for a rest day or
/// when nothing changes), the week's total before and after, and the token that applies exactly this preview.
/// </summary>
public sealed record SessionAdjustmentDto(
    string? Token,
    AdjustmentOutcome Outcome,
    string Reason,
    AdjustedSessionDto Before,
    AdjustedSessionDto? After,
    bool BecomesRest,
    double WeekKmBefore,
    double WeekKmAfter,
    double? SafeLimitKm,
    SessionAdjustmentRequest Request);

/// <summary>
/// Previews an exact change to one upcoming run on the runner's current plan, or with <paramref name="AcceptToken"/> applies
/// exactly the preview they saw. Nothing changes without that token; a changed plan, a new check-in or a new day asks for a new
/// preview. The undo is <see cref="RestoreSessionsCommand"/>, which puts the day back as the plan first wrote it.
/// </summary>
public sealed record AdjustSessionCommand(Guid Id, SessionAdjustmentRequest Request, string? AcceptToken = null) : IRequest<SessionAdjustmentDto>;

internal sealed class AdjustSessionHandler(SessionAdjustments adjustments) : IRequestHandler<AdjustSessionCommand, SessionAdjustmentDto>
{
    public Task<SessionAdjustmentDto> Handle(AdjustSessionCommand request, CancellationToken cancellationToken) =>
        adjustments.RunAsync(request.Id, request.Request, request.AcceptToken, cancellationToken);
}

/// <summary>Shared by the adjust endpoint and the coach, so a change the coach suggests is exactly what the runner can apply.</summary>
internal sealed class SessionAdjustments(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
{
    public async Task<SessionAdjustmentDto> RunAsync(Guid planId, SessionAdjustmentRequest request, string? acceptToken, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (!Enum.IsDefined(request.Kind))
            throw new ValidationException(new Dictionary<string, string[]> { ["kind"] = ["Choose a time, a distance or a pace."] });
        var saved = await OwnPlan.FindAsync(db, current, planId, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        if (saved.Status != SavedPlanStatus.Active) throw new ConflictException("plan_archived", "Only your current plan can change.");
        var today = CoachCalls.LocalToday(runner, time);
        var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        var query = SavedPlanMapping.ToQuery(saved);
        var written = builder.BuildPlan(query, calls, paceDate: today);
        var plan = RemainingWeek.Apply(written, saved.Adjustments);
        var from = today.AddDays(-SessionAdjuster.PainLookbackDays);
        var entries = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date < today.AddDays(LifeHappens.HorizonDays))
            .OrderBy(c => c.Id).ToListAsync(cancellationToken);
        var proposal = SessionAdjuster.Propose(plan, today, request, entries, written);
        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            today,
            saved.Version,
            saved.Adjustments,
            calls,
            proposal.Change,
            request,
            entries = entries.Select(c => new { c.Id, c.Date, c.SessionType, c.IsAdditional, c.Pain, c.UpdatedAt }),
        }))));

        if (acceptToken is not null)
        {
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(acceptToken), Encoding.UTF8.GetBytes(token))
                || proposal.Outcome != AdjustmentOutcome.Proposed || proposal.Change is null)
                throw new ConflictException("session_adjustment_changed", "Your plan or running has changed. Preview it again before applying.");
            db.SavedPlans.Attach(saved);
            saved.ApplySessionAdjustment(proposal.Change, today);
            await db.SaveChangesAsync(cancellationToken);
        }

        return new SessionAdjustmentDto(
            proposal.Outcome == AdjustmentOutcome.Proposed ? token : null,
            proposal.Outcome,
            proposal.Reason,
            Describe(plan, proposal.Before, null),
            proposal.After is { } after ? Describe(plan, after, proposal.Change) : null,
            proposal.Outcome == AdjustmentOutcome.Proposed && proposal.After is null,
            Math.Round(proposal.WeekKmBefore, 2),
            Math.Round(proposal.WeekKmAfter, 2),
            proposal.SafeLimitKm,
            request);
    }

    private static AdjustedSessionDto Describe(TrainingPlan plan, PlannedSession session, SessionRevision? change)
    {
        var zone = session.Zone ?? PaceZone.Easy;
        var (fast, slow) = change is { EasyFastestSecondsPerKm: { } f, EasySlowestSecondsPerKm: { } s } && (change.Type is null || SessionAdjuster.ZoneOf(change.Type.Value) == zone)
            ? (f, s)
            : (plan.Paces[zone].Fastest.SecondsPerKilometre, plan.Paces[zone].Slowest.SecondsPerKilometre);
        var minutes = (int)Math.Round(session.DistanceKm * (fast + slow) / 2 / 60);
        return new AdjustedSessionDto(session.Date, session.Type, session.Title, Math.Round(session.DistanceKm, 2), session.Zone,
            Math.Round(fast), Math.Round(slow), minutes, session.Steps?.Select(SessionStepDto.From).ToList() ?? []);
    }
}
