using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
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
    public static DateOnly LocalToday(Runner runner, TimeProvider time)
    {
        var zone = TimeZoneInfo.TryFindSystemTimeZoneById(runner.TimeZone, out var found) ? found : TimeZoneInfo.Utc;
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(time.GetUtcNow(), zone).DateTime);
    }
}

/// <summary>
/// Opens the runner's saved plan with the coach's calls applied. On or after a week's Monday, the coach makes that
/// week's call from how last week went (check-ins and recorded runs) and keeps it. Only the current week is ever
/// decided: weeks the runner didn't open the plan for ran as written.
/// </summary>
public sealed record CoachMyPlanCommand(Guid Id) : IRequest<SavedPlanDto>;

internal sealed class CoachMyPlanHandler(IApplicationDbContext db, CurrentRunner current, PlanBuilder builder, TimeProvider time)
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
        var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        var plan = builder.BuildPlan(query, calls);

        if (saved.Status == SavedPlanStatus.Active && await DecideThisWeekAsync(saved, runner, plan, calls, cancellationToken) is { } call)
        {
            db.CoachWeeks.Add(CoachWeek.From(saved.Id, call));
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // The same plan opened on two devices at once: the other one made this week's call first, and it stands.
                // Anything else is a real failure.
                if (!await db.CoachWeeks.AsNoTracking().AnyAsync(w => w.SavedPlanId == saved.Id && w.WeekStart == call.WeekStart, cancellationToken))
                {
                    throw;
                }
            }

            calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        }

        return new SavedPlanDto(saved.Id, saved.Name, saved.CreatedAt, query, builder.Build(query, calls), saved.Status,
            [.. calls.Select(CoachNoteDto.From)]);
    }

    private async Task<CoachDecision?> DecideThisWeekAsync(
        SavedPlan saved, Runner runner, TrainingPlan plan, IReadOnlyList<CoachDecision> calls, CancellationToken cancellationToken)
    {
        var today = CoachCalls.LocalToday(runner, time);
        var week = plan.Weeks.FirstOrDefault(w => w.StartDate <= today && today < w.StartDate.AddDays(7));
        var lastWeek = week is null ? null : plan.Weeks.FirstOrDefault(w => w.StartDate == week.StartDate.AddDays(-7));
        if (week is null || lastWeek is null || week.Phase == TrainingPhase.RaceWeek || calls.Any(c => c.WeekStart == week.StartDate))
        {
            return null;
        }

        // A replan last week or this week has just rebuilt the plan from where the runner is: judging the week behind it
        // again would count the same setback twice.
        if (saved.Inputs.Replan is { } replan && replan.From >= lastWeek.StartDate)
        {
            // Paces carry on as they were: the replan already starts from where the runner is.
            var previous = calls.LastOrDefault(c => c.WeekStart < week.StartDate);
            var asPlanned = CoachDecision.AsPlanned(week.StartDate, CoachVerdict.OnTrack, CoachReason.JustReplanned);
            return asPlanned with { Fitness = previous?.Fitness, PaceFactor = previous?.PaceFactor ?? 1 };
        }

        var from = lastWeek.StartDate;
        var to = week.StartDate;
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == saved.Id && c.Date >= from && c.Date < to)
            .ToListAsync(cancellationToken);
        var runs = await db.Activities.AsNoTracking()
            .Visible(time.GetUtcNow())
            .Where(a => a.RunnerId == runner.Id && a.LocalDate >= from && a.LocalDate < to)
            .ToListAsync(cancellationToken);

        var evidence = lastWeek.Sessions
            .Where(s => SessionCheckIn.IsCheckable(s.Type))
            .Select(s =>
            {
                var checkIn = checkIns.FirstOrDefault(c => c.Date == s.Date && c.SessionType == s.Type);
                var run = runs.FirstOrDefault(a => a.LocalDate == s.Date && a.PlannedSession?.SessionType == s.Type);
                return new RunEvidence(s, checkIn?.Answers, run?.DistanceKm, run?.ComparedWithPlan?.Pace, run?.HeartRateDriftPercent);
            })
            .ToList();

        var call = WeeklyCoach.Decide(week.StartDate, evidence, calls.FirstOrDefault(c => c.WeekStart == lastWeek.StartDate));
        return await WithFitnessAsync(call, runner, plan, evidence, calls, cancellationToken);
    }

    /// <summary>
    /// What the runner could race this week, from the best efforts in their recent runs. Without any, how last week's
    /// hard sessions felt nudges the paces instead. Kept with the call, because a Strava run only stays seven days.
    /// </summary>
    private async Task<CoachDecision> WithFitnessAsync(
        CoachDecision call, Runner runner, TrainingPlan plan, IReadOnlyList<RunEvidence> lastWeek, IReadOnlyList<CoachDecision> calls, CancellationToken cancellationToken)
    {
        var since = call.WeekStart.AddDays(-Fitness.WindowDays);
        var runs = await db.Activities.AsNoTracking()
            .Visible(time.GetUtcNow())
            .Where(a => a.RunnerId == runner.Id && a.LocalDate >= since && a.LocalDate < call.WeekStart)
            .ToListAsync(cancellationToken);
        var fitness = Fitness.Estimate(
            plan.RaceDistance,
            call.WeekStart,
            runs.SelectMany(a => a.BestEfforts.Select(e => new Effort(a.LocalDate, e.DistanceMetres, e.Elapsed))));
        var previousFactor = calls.LastOrDefault(c => c.WeekStart < call.WeekStart)?.PaceFactor ?? 1;
        return call with
        {
            Fitness = fitness,
            PaceFactor = fitness is null ? Fitness.PaceFactor(previousFactor, lastWeek) : 1,
        };
    }
}
