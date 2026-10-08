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
/// run, and <see cref="LongRunDay"/> must be one of them. <see cref="PlanFrom"/> is the runner's local
/// date when the plan was first built: the client sends it so the plan starts on the right day in the
/// runner's time zone, and a shared link reproduces the same plan later. It defaults to today (UTC).
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
    IReadOnlyList<DayOfWeek>? StrengthDays = null,
    DateOnly? PlanFrom = null) : IRequest<TrainingPlanDto>;

internal sealed class GeneratePlanValidator : AbstractValidator<GeneratePlanQuery>
{
    public const int MinDaysUntilRace = 14;
    public const int MaxDaysUntilRace = 2 * 365;

    // How far back a shared link can reach, and a day of slack either side of UTC for time zones.
    private const int MaxPlanAgeDays = 400;

    public GeneratePlanValidator(IRaceCatalogue catalogue, TimeProvider timeProvider)
    {
        DateOnly From(GeneratePlanQuery q) => q.PlanFrom ?? timeProvider.Today();

        RuleFor(q => q.PlanFrom)
            .Must(d => d >= timeProvider.Today().AddDays(-MaxPlanAgeDays) && d <= timeProvider.Today().AddDays(1))
            .When(q => q.PlanFrom is not null)
            .WithMessage("The plan date must be today, or the date a shared plan was first built.");

        When(q => string.IsNullOrWhiteSpace(q.RaceSlug), () =>
        {
            RuleFor(q => q.DistanceKm).Cascade(CascadeMode.Stop)
                .NotNull().WithMessage("Choose a race or enter a distance.")
                .GreaterThan(0)
                .LessThanOrEqualTo(Distance.MaxKilometres);
            RuleFor(q => q.RaceDate).Cascade(CascadeMode.Stop)
                .NotNull().WithMessage("Choose a race or enter a race date.")
                .Must((q, d) => d >= From(q).AddDays(MinDaysUntilRace))
                .WithMessage($"The race needs to be at least {MinDaysUntilRace} days away to build a plan.")
                .Must((q, d) => d <= From(q).AddDays(MaxDaysUntilRace))
                .WithMessage("Pick a race within the next two years.");
            RuleFor(q => q.RaceName).MaximumLength(100);
        });

        When(q => !string.IsNullOrWhiteSpace(q.RaceSlug), () =>
        {
            RuleFor(q => q.RaceSlug)
                .Must((q, slug) => catalogue.FindBySlug(slug!) is not { } race
                    || race.Date >= From(q).AddDays(MinDaysUntilRace))
                .WithMessage($"This race is less than {MinDaysUntilRace} days away, too close to build a plan.");
        });

        RuleFor(q => q.GoalTime)
            .Must((q, time) => DistanceFor(q, catalogue) is not { } km || GoalTimeRules.IsPlausible(km, time))
            .WithMessage(GoalTimeRules.Message);
        RuleFor(q => q.RunDays).Cascade(CascadeMode.Stop)
            .NotNull().WithMessage("Choose the days you can run.")
            .Must(days => days.Count <= 7).WithMessage("A week only has seven days.")
            .Must(days => days.Distinct().Count() is >= TrainingPlanGenerator.MinRunsPerWeek and <= TrainingPlanGenerator.MaxRunsPerWeek)
            .WithMessage($"Choose between {TrainingPlanGenerator.MinRunsPerWeek} and {TrainingPlanGenerator.MaxRunsPerWeek} run days.");
        RuleForEach(q => q.RunDays).IsInEnum();
        RuleFor(q => q.LongRunDay).Cascade(CascadeMode.Stop)
            .IsInEnum()
            .Must((q, day) => q.RunDays?.Contains(day) == true)
            .WithMessage("Your long run day must be one of your run days.");
        RuleFor(q => q.StrengthDays).Cascade(CascadeMode.Stop)
            .Must(days => days is null || days.Count <= 7).WithMessage("A week only has seven days.")
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
            request.PlanFrom ?? timeProvider.Today(),
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
