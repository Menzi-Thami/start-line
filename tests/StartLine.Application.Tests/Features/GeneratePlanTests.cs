using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Plans;

namespace StartLine.Application.Tests.Features;

public sealed class GeneratePlanTests
{
    private readonly FakeTimeProvider _time = new(TestRaces.Now);

    private static GeneratePlanQuery CustomRace(
        double? distanceKm = 21.0975,
        DateOnly? raceDate = null,
        TimeSpan? goal = null,
        DayOfWeek[]? runDays = null) => new(
            RaceSlug: null,
            RaceName: "Spring Half",
            DistanceKm: distanceKm,
            RaceDate: raceDate ?? new DateOnly(2027, 1, 17),
            GoalTime: goal ?? TimeSpan.FromHours(2),
            RunDays: runDays ?? FourDays,
            LongRunDay: DayOfWeek.Sunday,
            CurrentWeeklyKm: 25);

    private static readonly DayOfWeek[] FourDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static GeneratePlanQuery CatalogueRace(string slug, TimeSpan? goal = null) =>
        new(slug, null, null, null, goal ?? TimeSpan.FromHours(11), FourDays, DayOfWeek.Sunday, null);

    private GeneratePlanValidator Validator() => new(TestRaces.Catalogue(), _time);

    private GeneratePlanHandler Handler() => new(TestRaces.Catalogue(), _time);

    [Fact]
    public void A_complete_custom_race_is_valid() =>
        Validator().Validate(CustomRace()).IsValid.ShouldBeTrue();

    [Fact]
    public void A_custom_race_needs_a_distance_and_a_date()
    {
        var result = Validator().Validate(CustomRace() with { DistanceKm = null, RaceDate = null });

        result.Errors.Select(e => e.PropertyName).ShouldBe(["DistanceKm", "RaceDate"], ignoreOrder: true);
    }

    [Fact]
    public void A_race_less_than_two_weeks_away_is_rejected()
    {
        var result = Validator().Validate(CustomRace(raceDate: new DateOnly(2026, 10, 21)));

        result.Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("RaceDate");
    }

    [Fact]
    public void Two_weeks_away_is_just_far_enough() =>
        Validator().Validate(CustomRace(raceDate: new DateOnly(2026, 10, 22))).IsValid.ShouldBeTrue();

    [Theory]
    [InlineData(0, 3, 0)]   // a half marathon in three minutes
    [InlineData(30, 0, 0)]  // a half marathon in thirty hours
    public void An_impossible_goal_time_is_rejected(int hours, int minutes, int seconds)
    {
        var result = Validator().Validate(CustomRace(goal: new TimeSpan(hours, minutes, seconds)));

        result.Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("GoalTime");
    }

    [Fact]
    public void Needs_at_least_three_run_days() =>
        Validator().Validate(CustomRace(runDays: [DayOfWeek.Tuesday, DayOfWeek.Sunday]))
            .Errors.Select(e => e.PropertyName).ShouldContain("RunDays");

    [Fact]
    public void The_long_run_day_must_be_a_run_day() =>
        Validator().Validate(CustomRace() with { LongRunDay = DayOfWeek.Monday })
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("LongRunDay");

    [Fact]
    public void At_most_three_strength_days() =>
        Validator().Validate(CustomRace() with { StrengthDays = [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday] })
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("StrengthDays");

    [Fact]
    public async Task Passes_experience_and_strength_days_through_to_the_plan()
    {
        var plan = await Handler().Handle(CustomRace() with { Experience = Experience.New, StrengthDays = [DayOfWeek.Monday] }, CancellationToken.None);

        plan.Weeks[0].Sessions.ShouldContain(s => s.Type == SessionType.Strength && s.Date.DayOfWeek == DayOfWeek.Monday);
        plan.Category.ShouldBe(DistanceCategory.HalfMarathon);
    }

    [Fact]
    public void A_catalogue_race_checks_the_goal_against_its_own_distance()
    {
        // Two hours is fine for a half marathon but impossible for Comrades.
        var result = Validator().Validate(CatalogueRace("comrades-2027", TimeSpan.FromHours(2)));

        result.Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("GoalTime");
    }

    [Fact]
    public void A_catalogue_race_that_is_too_close_is_rejected()
    {
        var result = Validator().Validate(CatalogueRace("next-weekend-10k", TimeSpan.FromMinutes(50)));

        result.Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("RaceSlug");
    }

    [Fact]
    public async Task Builds_a_plan_for_a_catalogue_race()
    {
        var plan = await Handler().Handle(CatalogueRace("comrades-2027"), CancellationToken.None);

        plan.Race.ShouldBe(new RaceSummaryDto("comrades-2027", "Comrades Marathon", new DateOnly(2027, 6, 13), 90));
        plan.Weeks[^1].Sessions[^1].Type.ShouldBe(SessionType.Race);
        plan.Weeks[^1].Sessions[^1].Date.ShouldBe(new DateOnly(2027, 6, 13));
    }

    [Fact]
    public async Task Builds_a_plan_for_a_custom_race_and_starts_from_the_injected_clock()
    {
        var plan = await Handler().Handle(CustomRace(), CancellationToken.None);

        plan.Race.Name.ShouldBe("Spring Half");
        plan.Race.Slug.ShouldBeNull();
        plan.StartDate.ShouldBe(new DateOnly(2026, 10, 12));
        plan.Paces.Count.ShouldBe(6);
    }

    [Fact]
    public async Task Names_an_unnamed_custom_race()
    {
        var plan = await Handler().Handle(CustomRace() with { RaceName = "  " }, CancellationToken.None);

        plan.Race.Name.ShouldBe("Your race");
    }

    [Fact]
    public async Task An_unknown_race_is_not_found() =>
        await Should.ThrowAsync<NotFoundException>(() => Handler().Handle(CatalogueRace("no-such-race"), CancellationToken.None));
}
