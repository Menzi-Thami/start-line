using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Plans;
using StartLine.Domain.Races;

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

    private GeneratePlanHandler Handler() => new(new PlanBuilder(TestRaces.Catalogue(), _time));

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
    public async Task Strength_sessions_carry_their_exercises_and_runs_carry_none()
    {
        var plan = await Handler().Handle(CustomRace() with { StrengthDays = [DayOfWeek.Monday] }, CancellationToken.None);

        var sessions = plan.Weeks[0].Sessions;
        sessions.Single(s => s.Type == SessionType.Strength).Exercises
            .ShouldContain(e => e.Exercise == Exercise.Squat && e.Sets == 3 && e.Reps == 10 && e.Unit == RepUnit.Reps);
        sessions.Where(s => s.Type != SessionType.Strength).ShouldAllBe(s => s.Exercises.Count == 0);
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
    public void A_race_more_than_two_years_away_is_rejected() =>
        Validator().Validate(CustomRace(raceDate: new DateOnly(2028, 10, 9))).Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("RaceDate");

    [Fact]
    public async Task Plan_from_lets_a_shared_link_rebuild_the_same_plan_later()
    {
        var builtToday = await Handler().Handle(CustomRace(), CancellationToken.None);

        _time.Advance(TimeSpan.FromDays(9));
        var openedLater = await Handler().Handle(CustomRace() with { PlanFrom = new DateOnly(2026, 10, 8) }, CancellationToken.None);

        openedLater.StartDate.ShouldBe(builtToday.StartDate);
        openedLater.Weeks.Count.ShouldBe(builtToday.Weeks.Count);
    }

    [Fact]
    public async Task Plan_from_uses_the_runners_local_date_ahead_of_utc()
    {
        // 23:30 UTC on Sunday is already Monday morning in South Africa.
        _time.SetUtcNow(new DateTimeOffset(2026, 10, 11, 23, 30, 0, TimeSpan.Zero));

        var plan = await Handler().Handle(CustomRace() with { PlanFrom = new DateOnly(2026, 10, 12) }, CancellationToken.None);

        plan.StartDate.ShouldBe(new DateOnly(2026, 10, 12));
    }

    [Theory]
    [InlineData(-401)]
    [InlineData(2)]
    public void Plan_from_must_be_recent_and_not_in_the_future(int daysFromToday) =>
        Validator().Validate(CustomRace() with { PlanFrom = new DateOnly(2026, 10, 8).AddDays(daysFromToday) })
            .Errors.Select(e => e.PropertyName).ShouldContain("PlanFrom");

    [Fact]
    public async Task Warns_when_a_race_date_or_distance_is_not_confirmed_yet()
    {
        var unconfirmed = TestRaces.Comrades with { DateStatus = DateStatus.Provisional, DistanceConfirmed = false };
        var catalogue = TestRaces.Catalogue();
        catalogue.FindBySlug("comrades-2027").Returns(unconfirmed);

        var plan = await new GeneratePlanHandler(new PlanBuilder(catalogue, _time)).Handle(CatalogueRace("comrades-2027"), CancellationToken.None);

        plan.Warnings.Select(w => w.Code).ShouldContain("date-provisional");
        plan.Warnings.Select(w => w.Code).ShouldContain("distance-provisional");
    }

    [Fact]
    public async Task A_confirmed_race_carries_no_caveats() =>
        (await Handler().Handle(CatalogueRace("comrades-2027"), CancellationToken.None))
            .Warnings.ShouldNotContain(w => w.Code.EndsWith("-provisional", StringComparison.Ordinal));

    [Fact]
    public async Task An_unknown_race_is_not_found() =>
        await Should.ThrowAsync<NotFoundException>(() => Handler().Handle(CatalogueRace("no-such-race"), CancellationToken.None));

    private static GeneratePlanQuery Replanned(DateOnly? from, Setback? setback, double? lastWeekKm = null, DateOnly? raceDate = null) =>
        CustomRace(raceDate: raceDate) with { PlanFrom = new DateOnly(2026, 10, 8), ReplanFrom = from, Setback = setback, RecentWeeklyKm = lastWeekKm };

    [Fact]
    public void A_replan_from_today_is_valid() =>
        Validator().Validate(Replanned(new DateOnly(2026, 10, 8), Setback.Illness)).IsValid.ShouldBeTrue();

    [Fact]
    public void A_replan_needs_both_a_day_and_a_reason()
    {
        Validator().Validate(Replanned(null, Setback.Illness)).Errors.Select(e => e.PropertyName).ShouldContain("ReplanFrom");
        Validator().Validate(Replanned(new DateOnly(2026, 10, 8), null)).Errors.Select(e => e.PropertyName).ShouldContain("Setback");
    }

    [Theory]
    [InlineData(-1)] // before the plan was built
    [InlineData(2)]  // a day still to come
    public void A_replan_is_from_today_and_never_before_the_plan(int daysFromToday) =>
        Validator().Validate(Replanned(new DateOnly(2026, 10, 8).AddDays(daysFromToday), Setback.MissedTraining))
            .Errors.Select(e => e.PropertyName).ShouldContain("ReplanFrom");

    [Fact]
    public void A_replan_needs_two_weeks_before_the_race() =>
        Validator().Validate(Replanned(new DateOnly(2026, 10, 9), Setback.Illness, raceDate: new DateOnly(2026, 10, 22)))
            .Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("ReplanFrom");

    [Fact]
    public void Running_behind_needs_last_weeks_distance()
    {
        Validator().Validate(Replanned(new DateOnly(2026, 10, 8), Setback.Behind)).Errors.Select(e => e.PropertyName).ShouldContain("RecentWeeklyKm");
        Validator().Validate(Replanned(new DateOnly(2026, 10, 8), Setback.Behind, 20)).IsValid.ShouldBeTrue();
    }

    [Fact]
    public async Task A_replan_reaches_the_plan()
    {
        var plan = await Handler().Handle(Replanned(new DateOnly(2026, 10, 8), Setback.Injury), CancellationToken.None);

        plan.Replan.ShouldBe(new ReplanDto(new DateOnly(2026, 10, 8), Setback.Injury, null));
        plan.Weeks.ShouldAllBe(w => w.IsReplanned);
        plan.Warnings.ShouldContain(w => w.Code == "injury");
    }

    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    [InlineData(2)]
    public void A_known_generator_version_or_none_is_valid(int? version) =>
        Validator().Validate(CustomRace() with { Version = version }).IsValid.ShouldBeTrue();

    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    public void An_unknown_generator_version_is_rejected(int version) =>
        Validator().Validate(CustomRace() with { Version = version }).Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("Version");

    [Fact]
    public async Task A_plan_without_a_version_is_built_with_version_1()
    {
        var unversioned = await Handler().Handle(CustomRace(), CancellationToken.None);
        var first = await Handler().Handle(CustomRace() with { Version = 1 }, CancellationToken.None);
        var second = await Handler().Handle(CustomRace() with { Version = 2 }, CancellationToken.None);

        unversioned.Weeks.Select(w => w.PlannedKm).ShouldBe(first.Weeks.Select(w => w.PlannedKm));
        second.Weeks.Select(w => w.PlannedKm).ShouldNotBe(first.Weeks.Select(w => w.PlannedKm));
    }

    private static readonly DateOnly Today = new(2026, 10, 8);

    private static GeneratePlanQuery WithRecentResult(double km = 10, int minutes = 40, int daysAgo = 7) =>
        CustomRace() with { RecentResultKm = km, RecentResultTime = TimeSpan.FromMinutes(minutes), RecentResultDate = Today.AddDays(-daysAgo) };

    [Fact]
    public void A_recent_result_with_a_distance_a_time_and_a_day_is_valid() =>
        Validator().Validate(WithRecentResult()).IsValid.ShouldBeTrue();

    [Theory]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    [InlineData(false, false, true)]
    [InlineData(true, true, false)]
    public void A_recent_result_is_all_three_parts_or_none(bool km, bool time, bool date)
    {
        var query = CustomRace() with
        {
            RecentResultKm = km ? 10 : null,
            RecentResultTime = time ? TimeSpan.FromMinutes(40) : null,
            RecentResultDate = date ? Today.AddDays(-7) : null,
        };

        var result = Validator().Validate(query);

        result.IsValid.ShouldBeFalse();
        result.Errors.ShouldAllBe(e => e.PropertyName.StartsWith("RecentResult"));
    }

    [Fact]
    public void A_recent_result_that_cannot_be_right_is_rejected() =>
        Validator().Validate(WithRecentResult(minutes: 3)).Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("RecentResultTime");

    [Fact]
    public void A_recent_result_cannot_be_in_the_future() =>
        Validator().Validate(WithRecentResult(daysAgo: -5)).Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("RecentResultDate");

    [Fact]
    public async Task A_plan_carries_the_coachs_read_on_the_goal()
    {
        var plan = await Handler().Handle(CustomRace(), CancellationToken.None);

        var outlook = plan.Outlook.ShouldNotBeNull();
        outlook.Verdict.ShouldBe(GoalVerdict.NotAssessed);
        outlook.Reasons.ShouldContain(r => r.Code == "no-result");
    }

    [Fact]
    public async Task A_recent_result_lets_the_coach_say_the_goal_could_be_higher()
    {
        // A 10K in 40 minutes is about 1:28 for a half marathon: a 2 hour goal is far slower than that.
        var plan = await Handler().Handle(WithRecentResult(), CancellationToken.None);

        var outlook = plan.Outlook.ShouldNotBeNull();
        outlook.Verdict.ShouldBe(GoalVerdict.AheadOfGoal);
        outlook.SuggestedGoal.ShouldNotBeNull().ShouldBeLessThan(TimeSpan.FromHours(2));
        outlook.FitnessToday.ShouldNotBeNull();
    }

    [Fact]
    public async Task A_recent_result_never_changes_the_plan_only_the_outlook()
    {
        var without = await Handler().Handle(CustomRace(), CancellationToken.None);
        var with = await Handler().Handle(WithRecentResult(), CancellationToken.None);

        with.Weeks.Select(w => w.PlannedKm).ShouldBe(without.Weeks.Select(w => w.PlannedKm));
        with.SuggestedGoal.ShouldBe(without.SuggestedGoal);
        with.Outlook!.Verdict.ShouldNotBe(without.Outlook!.Verdict);
    }
}
