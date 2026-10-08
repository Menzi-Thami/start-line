using FluentValidation;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Races;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Plans;

/// <summary>
/// Either <see cref="RaceSlug"/> picks a race from the catalogue, or <see cref="DistanceKm"/> and
/// <see cref="RaceDate"/> describe any other race. <see cref="RunDays"/> are the days the runner can
/// run, and <see cref="LongRunDay"/> must be one of them.
/// </summary>
public sealed record GeneratePlanQuery(
    string? RaceSlug,
    string? RaceName,
    double? DistanceKm,
    DateOnly? RaceDate,
    TimeSpan GoalTime,
    IReadOnlyList<DayOfWeek> RunDays,
    DayOfWeek LongRunDay,
    double? CurrentWeeklyKm,
    Experience Experience = Experience.Regular,
    IReadOnlyList<DayOfWeek>? StrengthDays = null) : IRequest<TrainingPlanDto>;

internal sealed class GeneratePlanValidator : AbstractValidator<GeneratePlanQuery>
{
    public const int MinDaysUntilRace = 14;

    public GeneratePlanValidator(IRaceCatalogue catalogue, TimeProvider timeProvider)
    {
        When(q => string.IsNullOrWhiteSpace(q.RaceSlug), () =>
        {
            RuleFor(q => q.DistanceKm).Cascade(CascadeMode.Stop)
                .NotNull().WithMessage("Choose a race or enter a distance.")
                .GreaterThan(0)
                .LessThanOrEqualTo(Distance.MaxKilometres);
            RuleFor(q => q.RaceDate).Cascade(CascadeMode.Stop)
                .NotNull().WithMessage("Choose a race or enter a race date.")
                .Must(d => d >= timeProvider.Today().AddDays(MinDaysUntilRace))
                .WithMessage($"The race needs to be at least {MinDaysUntilRace} days away to build a plan.");
            RuleFor(q => q.RaceName).MaximumLength(100);
        });

        When(q => !string.IsNullOrWhiteSpace(q.RaceSlug), () =>
        {
            RuleFor(q => q.RaceSlug)
                .Must(slug => catalogue.FindBySlug(slug!) is not { } race
                    || race.Date >= timeProvider.Today().AddDays(MinDaysUntilRace))
                .WithMessage($"This race is less than {MinDaysUntilRace} days away, too close to build a plan.");
        });

        RuleFor(q => q.GoalTime)
            .Must((q, time) => DistanceFor(q, catalogue) is not { } km || GoalTimeRules.IsPlausible(km, time))
            .WithMessage(GoalTimeRules.Message);
        RuleFor(q => q.RunDays).Cascade(CascadeMode.Stop)
            .NotNull().WithMessage("Choose the days you can run.")
            .Must(days => days.Distinct().Count() is >= TrainingPlanGenerator.MinRunsPerWeek and <= TrainingPlanGenerator.MaxRunsPerWeek)
            .WithMessage($"Choose between {TrainingPlanGenerator.MinRunsPerWeek} and {TrainingPlanGenerator.MaxRunsPerWeek} run days.");
        RuleForEach(q => q.RunDays).IsInEnum();
        RuleFor(q => q.LongRunDay).Cascade(CascadeMode.Stop)
            .IsInEnum()
            .Must((q, day) => q.RunDays?.Contains(day) == true)
            .WithMessage("Your long run day must be one of your run days.");
        RuleFor(q => q.StrengthDays)
            .Must(days => days is null || days.Distinct().Count() <= TrainingPlanGenerator.MaxStrengthDays)
            .WithMessage($"Choose at most {TrainingPlanGenerator.MaxStrengthDays} strength days.");
        RuleForEach(q => q.StrengthDays).IsInEnum();
        RuleFor(q => q.Experience).IsInEnum();
        RuleFor(q => q.CurrentWeeklyKm).InclusiveBetween(0, 300).When(q => q.CurrentWeeklyKm is not null);
    }

    private static double? DistanceFor(GeneratePlanQuery q, IRaceCatalogue catalogue) =>
        string.IsNullOrWhiteSpace(q.RaceSlug)
            ? q.DistanceKm
            : catalogue.FindBySlug(q.RaceSlug)?.Distance.Kilometres;
}

internal sealed class GeneratePlanHandler(IRaceCatalogue catalogue, TimeProvider timeProvider)
    : IRequestHandler<GeneratePlanQuery, TrainingPlanDto>
{
    public Task<TrainingPlanDto> Handle(GeneratePlanQuery request, CancellationToken cancellationToken)
    {
        var race = ResolveRace(request);
        var plan = TrainingPlanGenerator.Generate(new PlanParameters(
            race.Distance,
            request.GoalTime,
            race.Date,
            timeProvider.Today(),
            request.RunDays,
            request.LongRunDay,
            request.CurrentWeeklyKm,
            request.Experience,
            request.StrengthDays));

        return Task.FromResult(TrainingPlanDto.From(plan, race.Summary));
    }

    private (Distance Distance, DateOnly Date, RaceSummaryDto Summary) ResolveRace(GeneratePlanQuery request)
    {
        if (!string.IsNullOrWhiteSpace(request.RaceSlug))
        {
            var race = catalogue.FindBySlug(request.RaceSlug) ?? throw new NotFoundException("Race", request.RaceSlug);
            return (race.Distance, race.Date, new RaceSummaryDto(race.Slug, race.Name, race.Date, race.Distance.Kilometres));
        }

        var distance = Distance.FromKilometres(request.DistanceKm!.Value);
        var date = request.RaceDate!.Value;
        var name = string.IsNullOrWhiteSpace(request.RaceName) ? "Your race" : request.RaceName.Trim();
        return (distance, date, new RaceSummaryDto(null, name, date, distance.Kilometres));
    }
}
