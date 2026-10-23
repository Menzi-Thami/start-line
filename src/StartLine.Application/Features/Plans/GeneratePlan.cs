using System.Globalization;
using FluentValidation;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Races;
using StartLine.Domain.Plans;
using StartLine.Domain.Races;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Plans;

/// <summary>
/// Either <see cref="RaceSlug"/> picks a race from the catalogue, or <see cref="DistanceKm"/> and
/// <see cref="RaceDate"/> describe any other race. <see cref="RunDays"/> are the days the runner can
/// run, and <see cref="LongRunDay"/> must be one of them. <see cref="PlanFrom"/> is the runner's local
/// date when the plan was first built: the client sends it so the plan starts on the right day in the
/// runner's time zone, and a shared link reproduces the same plan later. It defaults to today (UTC).
/// <see cref="ReplanFrom"/> and <see cref="Setback"/> together rebuild the plan from that date after missed training,
/// illness, injury or a lean spell; <see cref="RecentWeeklyKm"/> is what the runner ran last week, needed when behind.
/// <see cref="Version"/> is the generator version the plan was first built with: none or 1 for plans made before the
/// per-distance shapes, so their links and saved plans keep their shape; new plans send the latest (2).
/// <see cref="RecentResultKm"/>, <see cref="RecentResultTime"/> and <see cref="RecentResultDate"/> are a recent race or hard
/// effort, all three or none: they let the coach say whether the goal is realistic before any runs are recorded. They only
/// feed the goal outlook and never change the plan.
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
    DateOnly? PlanFrom = null,
    DateOnly? ReplanFrom = null,
    Setback? Setback = null,
    double? RecentWeeklyKm = null,
    int? Version = null,
    double? RecentResultKm = null,
    TimeSpan? RecentResultTime = null,
    DateOnly? RecentResultDate = null) : IRequest<TrainingPlanDto>;

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

        // A replan is a day and a reason, always together.
        RuleFor(q => q.Setback).NotNull().When(q => q.ReplanFrom is not null).WithMessage("Say why you're replanning.");
        RuleFor(q => q.Setback).IsInEnum();
        RuleFor(q => q.ReplanFrom).NotNull().When(q => q.Setback is not null).WithMessage("Say which day to replan from.");
        RuleFor(q => q.ReplanFrom).Cascade(CascadeMode.Stop)
            .Must((q, d) => d >= From(q) && d <= timeProvider.Today().AddDays(1))
            .When(q => q.ReplanFrom is not null)
            .WithMessage("A plan is replanned from today, on or after the day it was built.")
            .Must((q, d) => RaceDateFor(q, catalogue) is not { } race || race >= d!.Value.AddDays(MinDaysUntilRace))
            .When(q => q.ReplanFrom is not null)
            .WithMessage($"Your race is less than {MinDaysUntilRace} days away, too close to rebuild the plan. Rest if you need to, then follow your taper.");
        RuleFor(q => q.RecentWeeklyKm).InclusiveBetween(0, 300).When(q => q.RecentWeeklyKm is not null);
        RuleFor(q => q.RecentWeeklyKm)
            .Must(km => km is > 0)
            .When(q => q.Setback == Setback.Behind)
            .WithMessage("Say how far you ran last week, so the plan can pick up from there.");
        RuleFor(q => q.Version)
            .InclusiveBetween(TrainingPlanGenerator.OriginalVersion, TrainingPlanGenerator.LatestVersion)
            .When(q => q.Version is not null)
            .WithMessage("This plan link comes from a newer version of Taperday. Reload the page to open it.");

        // A recent result is a distance, a time and a day, always together.
        RuleFor(q => q.RecentResultKm).NotNull()
            .When(q => q.RecentResultTime is not null || q.RecentResultDate is not null)
            .WithMessage("Give the distance of your recent result.");
        RuleFor(q => q.RecentResultTime).NotNull()
            .When(q => q.RecentResultKm is not null || q.RecentResultDate is not null)
            .WithMessage("Give the time of your recent result.");
        RuleFor(q => q.RecentResultDate).NotNull()
            .When(q => q.RecentResultKm is not null || q.RecentResultTime is not null)
            .WithMessage("Give the date of your recent result.");
        RuleFor(q => q.RecentResultKm).Cascade(CascadeMode.Stop)
            .GreaterThan(0)
            .LessThanOrEqualTo(Distance.MaxKilometres)
            .When(q => q.RecentResultKm is not null);
        RuleFor(q => q.RecentResultTime)
            .Must((q, time) => q.RecentResultKm is not { } km || GoalTimeRules.IsPlausible(km, time!.Value))
            .When(q => q.RecentResultTime is not null)
            .WithMessage("That recent result doesn't look right. Check the distance and the time.");
        RuleFor(q => q.RecentResultDate)
            .Must(d => d <= timeProvider.Today().AddDays(1))
            .When(q => q.RecentResultDate is not null)
            .WithMessage("A recent result can't be in the future.");
    }

    private static DateOnly? RaceDateFor(GeneratePlanQuery q, IRaceCatalogue catalogue) =>
        string.IsNullOrWhiteSpace(q.RaceSlug)
            ? q.RaceDate
            : catalogue.FindBySlug(q.RaceSlug)?.Date;

    private static double? DistanceFor(GeneratePlanQuery q, IRaceCatalogue catalogue) =>
        string.IsNullOrWhiteSpace(q.RaceSlug)
            ? q.DistanceKm
            : catalogue.FindBySlug(q.RaceSlug)?.Distance.Kilometres;
}

internal sealed class GeneratePlanHandler(PlanBuilder builder) : IRequestHandler<GeneratePlanQuery, TrainingPlanDto>
{
    public Task<TrainingPlanDto> Handle(GeneratePlanQuery request, CancellationToken cancellationToken) =>
        Task.FromResult(builder.Build(request));
}
