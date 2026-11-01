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
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Coaching;

/// <summary>
/// The coach's call for one week, as the client shows it. Reasons are codes; the client words them. <c>Fitness</c> is the
/// race time recorded runs pointed to that week, <c>PaceFactor</c> the nudge to the paces without them (1 is none).
/// </summary>
public sealed record CoachNoteDto(
    DateOnly WeekStart,
    CoachVerdict Verdict,
    bool HoldVolume,
    int DoseStep,
    bool CutbackNow,
    IReadOnlyList<CoachReason> Reasons,
    TimeSpan? Fitness = null,
    double PaceFactor = 1)
{
    public static CoachNoteDto From(CoachDecision d)
    {
        ArgumentNullException.ThrowIfNull(d);
        return new(d.WeekStart, d.Verdict, d.HoldVolume, d.DoseStep, d.CutbackNow, d.Reasons, d.Fitness, d.PaceFactor);
    }
}

/// <summary>The coach's calls on a saved plan, oldest first. Every reader of a saved plan builds it with these.</summary>
internal static class CoachCalls
{
    public static async Task<IReadOnlyList<CoachDecision>> ForAsync(IApplicationDbContext db, Guid planId, CancellationToken cancellationToken)
    {
        var weeks = await db.CoachWeeks.AsNoTracking()
            .Where(w => w.SavedPlanId == planId)
            .OrderBy(w => w.WeekStart)
            .ToListAsync(cancellationToken);
        return [.. weeks.Select(w => w.ToDecision())];
    }

    /// <summary>Today where the runner is: a week starts on their Monday, not UTC's.</summary>
    public static DateOnly LocalToday(Runner runner, TimeProvider time) =>
        DateOnly.FromDateTime(time.LocalNow(TimeProviderExtensions.ZoneOf(runner.TimeZone)));
}

/// <summary>
/// Opens the runner's saved plan with already accepted coaching calls. Reading a plan never accepts a new call;
/// review and apply endpoints make proposed weekly changes explicit.
/// </summary>
public sealed record CoachMyPlanCommand(Guid Id) : IRequest<SavedPlanDto>;

internal sealed class CoachMyPlanHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, PlanCoach coach, TimeProvider time)
    : IRequestHandler<CoachMyPlanCommand, SavedPlanDto>
{
    public async Task<SavedPlanDto> Handle(CoachMyPlanCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var saved = runner is null
            ? null
            : await db.SavedPlans.AsNoTracking().SingleOrDefaultAsync(p => p.Id == request.Id && p.RunnerId == runner.Id, cancellationToken);
        if (runner is null || saved is null)
        {
            throw new NotFoundException("Saved plan", request.Id.ToString());
        }

        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        var calls = await coach.CallsAsync(saved, runner, cancellationToken);
        return new SavedPlanDto(saved.Id, saved.Name, saved.CreatedAt, query, builder.Build(query, calls, saved.Adjustments, CoachCalls.LocalToday(runner, time)), saved.Status,
            [.. calls.Select(CoachNoteDto.From)]);
    }
}

/// <summary>
/// Reads accepted calls, previews the current week's proposal without saving, and persists a call only after explicit
/// application. Reminders and plan readers use the same accepted calls.
/// </summary>
internal sealed class PlanCoach(IApplicationDbContext db, PlanBuilder builder, TimeProvider time)
{
    public async Task<IReadOnlyList<CoachDecision>> CallsAsync(SavedPlan saved, Runner runner, CancellationToken cancellationToken, bool preview = false, RecoveryReadiness recovery = RecoveryReadiness.NotReported)
    {
        ArgumentNullException.ThrowIfNull(saved);
        ArgumentNullException.ThrowIfNull(runner);
        var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        if (!preview || saved.Status != SavedPlanStatus.Active)
        {
            return calls;
        }

        var plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), calls, saved.Adjustments, CoachCalls.LocalToday(runner, time));
        var call = await DecideThisWeekAsync(saved, runner, plan, calls, recovery, cancellationToken);
        return call is null ? calls : [.. calls, call];
    }

    public async Task AcceptAsync(Guid planId, CoachDecision call, bool changedPlan, RecoveryReadiness recovery, CancellationToken cancellationToken)
    {
        db.CoachWeeks.Add(CoachWeek.From(planId, call));
        db.CoachingDecisions.Add(CoachingDecisionLog.Record(planId, call, CoachingOutcome.Accepted, changedPlan, recovery, time.GetUtcNow()));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            if (await db.CoachWeeks.AsNoTracking().AnyAsync(w => w.SavedPlanId == planId && w.WeekStart == call.WeekStart, cancellationToken))
            {
                throw new ConflictException("coaching_changed", "Your coaching changed on another device. Review the latest suggestion before applying it.");
            }

            throw;
        }
    }

    private async Task<CoachDecision?> DecideThisWeekAsync(
        SavedPlan saved, Runner runner, TrainingPlan plan, IReadOnlyList<CoachDecision> calls, RecoveryReadiness recovery, CancellationToken cancellationToken)
    {
        var today = CoachCalls.LocalToday(runner, time);
        var targetDay = today.DayOfWeek == DayOfWeek.Sunday ? today.AddDays(1) : today;
        var week = plan.Weeks.FirstOrDefault(w => w.StartDate <= targetDay && targetDay < w.StartDate.AddDays(7));
        var lastWeek = week is null ? null : plan.Weeks.FirstOrDefault(w => w.StartDate == week.StartDate.AddDays(-7));
        if (week is null || lastWeek is null || week.Phase == TrainingPhase.RaceWeek || calls.Any(c => c.WeekStart == week.StartDate))
        {
            return null;
        }

        var from = lastWeek.StartDate;
        var to = week.StartDate;
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date < to)
            .ToListAsync(cancellationToken);
        // Uploads only: the call is kept for good, and a synced Strava run may stay seven days at most, along with anything
        // worked out from it. A runner who ran it ticks the session, and that check-in is theirs to keep.
        var runs = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.LocalDate >= from && a.LocalDate < to)
            .ToListAsync(cancellationToken);

        var evidence = CoachEvidence.ForWeek(lastWeek.Sessions, checkIns, runs);

        // A replan last week or this week has just rebuilt the plan from where the runner is: judging the week behind it
        // again would count the same setback twice.
        if (saved.Inputs.Replan is { } replan && replan.From >= lastWeek.StartDate)
        {
            // Paces carry on as they were: the replan already starts from where the runner is.
            var previous = calls.LastOrDefault(c => c.WeekStart < week.StartDate);
            var asPlanned = CoachDecision.AsPlanned(week.StartDate, CoachVerdict.OnTrack, CoachReason.JustReplanned);
            return WeeklyReview.Guide(asPlanned with { Fitness = previous?.Fitness, PaceFactor = previous?.PaceFactor ?? 1 }, evidence, calls, new(week, lastWeek, recovery, plan.GoalTime, checkIns.Any(c => c.IsAdditional && c.Status != CheckInStatus.Skipped), checkIns.Any(c => c.Pain == PainLevel.ChangedRunning)));
        }

        var call = WeeklyCoach.Decide(week.StartDate, evidence, calls.FirstOrDefault(c => c.WeekStart == lastWeek.StartDate));
        call = await WithFitnessAsync(call, runner, plan, evidence, calls, cancellationToken);
        return WeeklyReview.Guide(call, evidence, calls, new(week, lastWeek, recovery, plan.GoalTime, checkIns.Any(c => c.IsAdditional && c.Status != CheckInStatus.Skipped), checkIns.Any(c => c.Pain == PainLevel.ChangedRunning)));
    }

    /// <summary>
    /// What the runner could race this week, from the best efforts in their recent uploaded runs. Without any, how last
    /// week's hard sessions felt nudges the paces instead. Kept with the call, so never worked out from a Strava run: those
    /// stay seven days at most, and so must anything derived from them.
    /// </summary>
    private async Task<CoachDecision> WithFitnessAsync(
        CoachDecision call, Runner runner, TrainingPlan plan, IReadOnlyList<RunEvidence> lastWeek, IReadOnlyList<CoachDecision> calls, CancellationToken cancellationToken)
    {
        var since = call.WeekStart.AddDays(-Fitness.WindowDays);
        var runs = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.LocalDate >= since && a.LocalDate < call.WeekStart)
            .ToListAsync(cancellationToken);
        var fitness = Fitness.Estimate(plan.RaceDistance, call.WeekStart, CoachEvidence.Efforts(runs));
        var previousFactor = calls.LastOrDefault(c => c.WeekStart < call.WeekStart)?.PaceFactor ?? 1;
        return call with
        {
            Fitness = fitness,
            PaceFactor = fitness is null ? Fitness.PaceFactor(previousFactor, lastWeek) : 1,
        };
    }
}

/// <summary>
/// A read-only preview and a fingerprint of exactly the plan the runner reviewed. With that fingerprint the runner accepts
/// the suggestion, or declines it: a decline changes nothing but is kept in their coaching history.
/// </summary>
public sealed record WeeklyReviewDto(DateOnly ReviewedWeek, DateOnly TargetWeek, int RunsPlanned, int RunsCompleted, int Skipped,
    int MissingCheckIns, int Substitutions, double PlannedKm, double ReportedKm, int UnknownDistances, RecoveryReadiness Recovery);
public sealed record CoachingProposalDto(string Token, bool HasChanges, bool CanApply, SavedPlanDto Proposed, WeeklyReviewDto? Review = null);

public sealed record ReviewCoachingCommand(Guid Id, string? AcceptToken = null, RecoveryReadiness Recovery = RecoveryReadiness.NotReported, bool Decline = false) : IRequest<CoachingProposalDto>;

internal sealed class ReviewCoachingHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, PlanCoach coach, TimeProvider time)
    : IRequestHandler<ReviewCoachingCommand, CoachingProposalDto>
{
    public async Task<CoachingProposalDto> Handle(ReviewCoachingCommand request, CancellationToken cancellationToken)
    {
        var saved = await OwnPlan.FindAsync(db, current, request.Id, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var existing = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        if (!Enum.IsDefined(request.Recovery)) throw new Domain.Common.DomainException("Choose how recovered you feel.");
        var proposed = await coach.CallsAsync(saved, runner, cancellationToken, preview: true, recovery: request.Recovery);
        var query = SavedPlanMapping.ToQuery(saved.Inputs);
        var today = CoachCalls.LocalToday(runner, time);
        var targetDay = today.DayOfWeek == DayOfWeek.Sunday ? today.AddDays(1) : today;
        var targetWeek = targetDay.AddDays(-((int)targetDay.DayOfWeek + 6) % 7);
        var plan = builder.Build(query, proposed, saved.Adjustments, targetWeek);
        var original = builder.Build(query, existing, saved.Adjustments, targetWeek);
        var from = targetWeek.AddDays(-7);
        var answers = await db.SessionCheckIns.AsNoTracking().Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date < targetWeek).OrderBy(c => c.Id).ToListAsync(cancellationToken);
        var uploads = await db.Activities.AsNoTracking().Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.LocalDate >= from && a.LocalDate < targetWeek).OrderBy(a => a.Id).ToListAsync(cancellationToken);
        WeeklyReviewDto? review = null;
        if (original.Weeks.FirstOrDefault(w => w.StartDate == from) is { } reviewed)
        {
            var sessions = reviewed.Sessions.Where(s => SessionCheckIn.IsCheckable(s.Type)).ToList();
            var logged = sessions.Select(s => new { Entry = answers.FirstOrDefault(c => !c.IsAdditional && c.Date == s.Date && c.SessionType == s.Type), Uploaded = uploads.Any(a => a.LocalDate == s.Date && a.PlannedSession?.SessionType == s.Type) }).ToList();
            var km = uploads.Sum(a => a.DistanceKm) + answers.Where(c => c.Status != CheckInStatus.Skipped && c.DistanceKm.HasValue && !uploads.Any(a => a.Id == c.ActivityId || !c.IsAdditional && a.LocalDate == c.Date)).Sum(c => c.DistanceKm!.Value);
            review = new(from, targetWeek, sessions.Count, logged.Count(c => c.Entry is { Status: not CheckInStatus.Skipped } || c.Entry is null && c.Uploaded),
                logged.Count(c => c.Entry?.Status == CheckInStatus.Skipped), logged.Count(c => c.Entry is null && !c.Uploaded),
                logged.Count(c => c.Entry is { } e && (e.Status == CheckInStatus.SwappedForEasy || e.ActualSessionType is { } actual && actual != e.SessionType)),
                reviewed.PlannedKm, km, answers.Count(c => c.Status != CheckInStatus.Skipped && c.DistanceKm is null && !uploads.Any(a => a.Id == c.ActivityId || !c.IsAdditional && a.LocalDate == c.Date)), request.Recovery);
        }
        var completedToday = await db.SessionCheckIns.AnyAsync(c => c.SavedPlanId == saved.Id && c.Date == today && !c.IsAdditional && c.Status != CheckInStatus.Skipped, cancellationToken);
        var originalPast = original.Weeks.SelectMany(w => w.Sessions).Where(s => s.Date < today || completedToday && s.Date == today);
        var proposedPast = plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Date < today || completedToday && s.Date == today);
        if (JsonSerializer.Serialize(originalPast) != JsonSerializer.Serialize(proposedPast))
        {
            // Weekly calls fit a whole week. Never rewrite sessions whose days have passed or were already completed;
            // the existing replan flow can rebuild from next Monday without touching this week's history.
            proposed = existing;
            plan = original;
        }

        var dto = new SavedPlanDto(saved.Id, saved.Name, saved.CreatedAt, query, plan, saved.Status, [.. proposed.Select(CoachNoteDto.From)]);
        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { dto, today, saved.Version, review, answers = answers.Select(c => new { c.Id, c.Date, c.SessionType, c.IsAdditional, c.Answers }), uploads = uploads.Select(a => new { a.Id, a.LocalDate, a.DistanceKm, a.MovingTime }) }))));
        var changed = JsonSerializer.Serialize(original) != JsonSerializer.Serialize(plan);
        var pending = proposed.LastOrDefault(c => !existing.Any(e => e.WeekStart == c.WeekStart));
        var canApply = pending is not null && !(today.DayOfWeek == DayOfWeek.Sunday && review?.MissingCheckIns > 0);
        if (request.AcceptToken is not null)
        {
            if (request.AcceptToken != token || !canApply || pending is null || saved.Status != SavedPlanStatus.Active)
            {
                throw new ConflictException("coaching_changed", "Your running or plan has changed. Review the latest suggestion before applying it.");
            }

            if (request.Decline)
            {
                db.CoachingDecisions.Add(CoachingDecisionLog.Record(saved.Id, pending, CoachingOutcome.Declined, changed, request.Recovery, time.GetUtcNow()));
                await db.SaveChangesAsync(cancellationToken);
                // Nothing changes: the plan stays as the runner had it, and the suggestion can be reviewed again.
                dto = dto with { Plan = original, Coaching = [.. existing.Select(CoachNoteDto.From)] };
                return new(token, false, canApply, dto, review);
            }

            await coach.AcceptAsync(saved.Id, pending, changed, request.Recovery, cancellationToken);
            // The apply response is the current view, while the preview shows the target week’s zones.
            dto = dto with { Plan = builder.Build(query, proposed, saved.Adjustments, today) };
        }

        return new(token, changed, canApply, dto, review);
    }
}
