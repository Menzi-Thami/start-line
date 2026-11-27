using System.Globalization;
using FluentValidation;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Races;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Plans;

/// <summary>
/// Turns plan inputs into a plan: resolves the race (catalogue or custom), runs the generator and adds
/// caveats about unconfirmed race details. Shared by the anonymous builder and saved plans, because a
/// handler must never dispatch another handler.
/// </summary>
internal sealed class PlanBuilder(IRaceCatalogue catalogue, TimeProvider timeProvider)
{
    /// <param name="coaching">The coach's calls, for a saved plan. A plan from a link has none.</param>
    public TrainingPlanDto Build(GeneratePlanQuery request, IReadOnlyList<CoachDecision>? coaching = null, IReadOnlyList<SessionRevision>? adjustments = null, DateOnly? paceDate = null)
    {
        var (plan, parameters, race) = Generate(request, coaching, paceDate);
        var outlook = TrainingPlanGenerator.AssessGoal(parameters, plan, timeProvider.Today(), RecentResultOf(request));
        var dto = TrainingPlanDto.From(RemainingWeek.Apply(plan, adjustments), race.Summary, outlook) with { Adjustments = adjustments };
        return race.Caveats.Count == 0 ? dto : dto with { Warnings = [.. race.Caveats, .. dto.Warnings] };
    }

    /// <summary>The plan itself, for features that need more than the public shape of it (such as each session's structure).</summary>
    public TrainingPlan BuildPlan(GeneratePlanQuery request, IReadOnlyList<CoachDecision>? coaching = null, IReadOnlyList<SessionRevision>? adjustments = null, DateOnly? paceDate = null) => RemainingWeek.Apply(Generate(request, coaching, paceDate).Plan, adjustments);

    /// <summary>The canonical resolver for every persisted plan. Callers must first scope ownership.</summary>
    public TrainingPlan BuildPlan(SavedPlan saved, IReadOnlyList<CoachDecision>? coaching = null,
        IReadOnlyList<SessionRevision>? adjustments = null, DateOnly? paceDate = null, bool original = false)
    {
        ArgumentNullException.ThrowIfNull(saved);
        var changes = original ? null : adjustments ?? saved.Adjustments;
        if (saved.Prescription is not { } prescription)
            return BuildPlan(SavedPlanMapping.ToQuery(saved), coaching, changes, paceDate);
        // A prescription is authoritative. Generic coaching and replan must never rewrite its steps or pace bands.
        var baseline = Generate(SavedPlanMapping.ToQuery(saved), null, paceDate).Plan;
        var moved = prescription with { Sessions = [.. prescription.Sessions.Select(s => saved.GymMoves.SingleOrDefault(m => m.SessionId == s.Id) is { } move ? s with { Date = move.Date } : s)] };
        return RemainingWeek.Apply(moved.Apply(baseline), changes);
    }

    public TrainingPlanDto Build(SavedPlan saved, IReadOnlyList<CoachDecision>? coaching = null,
        IReadOnlyList<SessionRevision>? adjustments = null, DateOnly? paceDate = null)
    {
        ArgumentNullException.ThrowIfNull(saved);
        if (saved.Prescription is null) return Build(SavedPlanMapping.ToQuery(saved), coaching, adjustments ?? saved.Adjustments, paceDate);
        var plan = BuildPlan(saved, coaching, adjustments, paceDate);
        var race = new RaceSummaryDto(null, saved.Inputs.RaceName ?? saved.Name, plan.RaceDate, plan.RaceDistance.Kilometres);
        var dto = TrainingPlanDto.From(plan, race) with
        {
            IsPrivate = true,
            Adjustments = adjustments ?? saved.Adjustments,
            Paces = [.. saved.Prescription.Paces.OrderBy(p => p.Zone).Select(p => new PaceZoneDto(p.Zone, p.FastestSecondsPerKm, p.SlowestSecondsPerKm))]
        };
        var sessions = plan.Weeks.SelectMany(w => w.Sessions).ToDictionary(s => (s.Date, s.Type));
        return dto with
        {
            Weeks = [.. dto.Weeks.Select(w => w with { Sessions = [.. w.Sessions.Select(s =>
        {
            var origin = (adjustments ?? saved.Adjustments).LastOrDefault(r => r.Date == s.Date && r.MovedFrom is not null && r.OriginalType == s.Type)?.MovedFrom ?? s.Date;
            var prescribed = saved.Prescription.Sessions.SingleOrDefault(p =>
                (saved.GymMoves.SingleOrDefault(m => m.SessionId == p.Id)?.Date ?? p.Date) == origin && (p.Type == SessionType.Strength) == (s.Type == SessionType.Strength));
            s = s with { Steps = sessions[(s.Date, s.Type)].Steps?.Select(ExactStep).ToList() ?? [] };
            return prescribed is null ? s : s with { PrescriptionId = prescribed.Id, TargetRpe = s.Type == prescribed.Type ? prescribed.TargetRpe : Math.Min(prescribed.TargetRpe, ExpectedEffort.For(s.Type)?.High ?? prescribed.TargetRpe), Gym = prescribed.Gym,
                GymDone = saved.GymCompletions.Any(c => c.SessionId == prescribed.Id) };
        })] })]
        };
    }

    // Public DTO rounding stays unchanged. Private watch steps and bands retain the supplied numbers.
    private static SessionStepDto ExactStep(SessionStep step) => new(step.Kind, step.DistanceKm, step.Duration?.TotalSeconds, step.Zone,
        step.Pace?.Fastest.SecondsPerKilometre, step.Pace?.Slowest.SecondsPerKilometre, step.Effort, step.Times,
        step.Block?.Select(ExactStep).ToList() ?? []);

    private static RecentResult? RecentResultOf(GeneratePlanQuery request) =>
        request is { RecentResultKm: { } km, RecentResultTime: { } time, RecentResultDate: { } date }
            ? new RecentResult(Distance.FromKilometres(km), time, date)
            : null;

    private (TrainingPlan Plan, PlanParameters Parameters, (Distance Distance, DateOnly Date, RaceSummaryDto Summary, IReadOnlyList<PlanWarningDto> Caveats) Race) Generate(
        GeneratePlanQuery request, IReadOnlyList<CoachDecision>? coaching, DateOnly? paceDate)
    {
        var race = ResolveRace(request);
        var parameters = new PlanParameters(
            race.Distance,
            request.GoalTime,
            race.Date,
            request.PlanFrom ?? timeProvider.Today(),
            request.RunDays,
            request.LongRunDay,
            request.CurrentWeeklyKm,
            request.Experience,
            request.StrengthDays,
            request is { ReplanFrom: { } from, Setback: { } setback } ? new PlanReplan(from, setback, request.RecentWeeklyKm) : null,
            coaching,
            request.Version ?? TrainingPlanGenerator.OriginalVersion,
            request.StartOn,
            request.RunWalk ?? RunWalkMode.Auto);
        var plan = TrainingPlanGenerator.Generate(parameters);
        var active = (coaching ?? []).Where(c => c.WeekStart <= (paceDate ?? timeProvider.Today())).ToList();
        if (active.Count < (coaching?.Count ?? 0))
        {
            parameters = parameters with { Coaching = active };
            var current = TrainingPlanGenerator.Generate(parameters);
            plan = plan with
            {
                Paces = current.Paces,
                SuggestedGoal = current.SuggestedGoal,
                Warnings = [.. plan.Warnings.Where(w => w.Code != "goal-within-reach"), .. current.Warnings.Where(w => w.Code == "goal-within-reach")]
            };
        }
        return (plan, parameters, race);
    }

    private (Distance Distance, DateOnly Date, RaceSummaryDto Summary, IReadOnlyList<PlanWarningDto> Caveats) ResolveRace(GeneratePlanQuery request)
    {
        if (!string.IsNullOrWhiteSpace(request.RaceSlug))
        {
            var race = catalogue.FindBySlug(request.RaceSlug);
            if (race is null)
            {
                if (request.DistanceKm is not > 0 || request.RaceDate is null)
                    throw new NotFoundException("Race", request.RaceSlug);
                return SnapshotRace(request);
            }
            List<PlanWarningDto> caveats = [];
            if (race.DateStatus == DateStatus.Provisional)
            {
                caveats.Add(new("date-provisional",
                    $"{race.Name}'s date isn't confirmed by the organiser yet. If it moves, open your plan link again and the plan moves with it."));
            }

            if (!race.DistanceConfirmed)
            {
                caveats.Add(new("distance-provisional",
                    $"{race.Name}'s official distance isn't confirmed yet. The plan uses about {race.Distance.Kilometres.ToString("0.#", CultureInfo.InvariantCulture)} km, which makes little difference to the training."));
            }

            return (race.Distance, race.Date, new RaceSummaryDto(race.Slug, race.Name, race.Date, race.Distance.Kilometres), caveats);
        }

        return SnapshotRace(request);
    }

    private static (Distance Distance, DateOnly Date, RaceSummaryDto Summary, IReadOnlyList<PlanWarningDto> Caveats) SnapshotRace(GeneratePlanQuery request)
    {
        var distance = Distance.FromKilometres(request.DistanceKm!.Value);
        var date = request.RaceDate!.Value;
        var name = string.IsNullOrWhiteSpace(request.RaceName) ? "Your race" : request.RaceName.Trim();
        return (distance, date, new RaceSummaryDto(request.RaceSlug, name, date, distance.Kilometres), []);
    }
}
