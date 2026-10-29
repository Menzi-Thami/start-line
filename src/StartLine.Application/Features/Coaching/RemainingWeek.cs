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
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Coaching;

public sealed record RemainingWeekProposalDto(string Token, string Summary, IReadOnlyList<SessionRevision> Changes, TrainingPlanDto Proposed);
public sealed record ReviewRemainingWeekCommand(Guid Id, string? AcceptToken = null) : IRequest<RemainingWeekProposalDto>;
internal sealed class ReviewRemainingWeekHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
    : IRequestHandler<ReviewRemainingWeekCommand, RemainingWeekProposalDto>
{
    public async Task<RemainingWeekProposalDto> Handle(ReviewRemainingWeekCommand request, CancellationToken cancellationToken)
    {
        var saved = await OwnPlan.FindAsync(db, current, request.Id, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        if (saved.Status != SavedPlanStatus.Active) throw new ConflictException("plan_archived", "Only your current plan can be adjusted.");
        var today = CoachCalls.LocalToday(runner, time);
        var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        var original = builder.BuildPlan(query, calls, paceDate: today);
        var plan = Domain.Plans.RemainingWeek.Apply(original, saved.Adjustments);
        var week = original.Weeks.FirstOrDefault(w => w.StartDate <= today && today < w.StartDate.AddDays(7));
        var from = week?.StartDate ?? today;
        var entries = await db.SessionCheckIns.AsNoTracking().Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date < from.AddDays(7)).OrderBy(c => c.Id).ToListAsync(cancellationToken);
        var uploads = await db.Activities.AsNoTracking().Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.LocalDate >= from && a.LocalDate <= today).OrderBy(a => a.Id).ToListAsync(cancellationToken);
        var changes = Domain.Plans.RemainingWeek.Preview(plan, entries, uploads, today, week?.PlannedKm);
        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            today,
            saved.Version,
            saved.Inputs,
            saved.Adjustments,
            calls,
            changes,
            entries = entries.Select(c => new { c.Id, c.Date, c.SessionType, c.IsAdditional, c.Answers }),
            uploads = uploads.Select(a => new { a.Id, a.LocalDate, a.DistanceKm }),
        }))));
        if (request.AcceptToken is not null && (request.AcceptToken != token || changes.Count == 0))
            throw new ConflictException("adjustment_changed", "Your running or plan has changed. Preview the remaining week again before applying it.");
        if (request.AcceptToken is not null) db.SavedPlans.Attach(saved);
        saved.AdjustRemainingWeek(changes, today);
        if (request.AcceptToken is not null) await db.SaveChangesAsync(cancellationToken);
        var summary = changes.Count > 0
            ? "Ease the remaining runs without adding days or making up kilometres. Rest replaces running if you reported pain that changed your running or have already covered the week's distance."
            : week?.Phase == TrainingPhase.RaceWeek ? "Race week stays as written. Do not make up missed sessions; choose rest if unwell or in pain."
            : "No further changes suggested. Log any missing runs first. Replan from here can rebuild future weeks after a longer break.";
        return new(token, summary, changes, builder.Build(query, calls, saved.Adjustments, today));
    }
}
