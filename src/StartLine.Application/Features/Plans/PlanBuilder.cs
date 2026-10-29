using System.Globalization;
using FluentValidation;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
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
            request.StartOn);
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
            var race = catalogue.FindBySlug(request.RaceSlug) ?? throw new NotFoundException("Race", request.RaceSlug);
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

        var distance = Distance.FromKilometres(request.DistanceKm!.Value);
        var date = request.RaceDate!.Value;
        var name = string.IsNullOrWhiteSpace(request.RaceName) ? "Your race" : request.RaceName.Trim();
        return (distance, date, new RaceSummaryDto(null, name, date, distance.Kilometres), []);
    }
}
