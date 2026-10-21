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
    public TrainingPlanDto Build(GeneratePlanQuery request, IReadOnlyList<CoachDecision>? coaching = null)
    {
        var (plan, race) = Generate(request, coaching);
        var dto = TrainingPlanDto.From(plan, race.Summary);
        return race.Caveats.Count == 0 ? dto : dto with { Warnings = [.. race.Caveats, .. dto.Warnings] };
    }

    /// <summary>The plan itself, for features that need more than the public shape of it (such as each session's structure).</summary>
    public TrainingPlan BuildPlan(GeneratePlanQuery request, IReadOnlyList<CoachDecision>? coaching = null) => Generate(request, coaching).Plan;

    private (TrainingPlan Plan, (Distance Distance, DateOnly Date, RaceSummaryDto Summary, IReadOnlyList<PlanWarningDto> Caveats) Race) Generate(
        GeneratePlanQuery request, IReadOnlyList<CoachDecision>? coaching)
    {
        var race = ResolveRace(request);
        var plan = TrainingPlanGenerator.Generate(new PlanParameters(
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
            coaching));
        return (plan, race);
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
