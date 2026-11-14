using StartLine.Domain.Common;
using StartLine.Domain.Journey;

namespace StartLine.Domain.Tests.Journey;

public class MaintenanceGeneratorTests
{
    // A Wednesday.
    private static readonly DateOnly Today = new(2026, 11, 18);

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public void Only_easy_optional_sessions_within_their_limits_on_the_chosen_number_of_days(int daysPerWeek)
    {
        var days = MaintenanceGenerator.DaysFor(daysPerWeek, null);
        var weeks = MaintenanceGenerator.Build(days, includeStrength: true, Today, Today);

        weeks.Count.ShouldBe(MaintenanceGenerator.WeeksShown);
        weeks[0].WeekStart.ShouldBe(new DateOnly(2026, 11, 16));
        weeks.Skip(1).ShouldAllBe(w => w.Sessions.Count(s => s.Kind != MaintenanceSessionKind.Strength) == daysPerWeek);
        var sessions = weeks.SelectMany(w => w.Sessions).ToList();
        sessions.ShouldAllBe(s => s.Optional && s.Date >= Today);
        sessions.Where(s => s.Kind == MaintenanceSessionKind.EasyRun).ShouldAllBe(s => s.MinMinutes == 25 && s.MaxMinutes == 40);
        sessions.Where(s => s.Kind == MaintenanceSessionKind.LongerEasyRun).ShouldAllBe(s => s.MinMinutes == 40 && s.MaxMinutes == 60);
        sessions.Where(s => s.Kind == MaintenanceSessionKind.Strength).ShouldAllBe(s => s.MinMinutes == 20 && s.MaxMinutes == 30 && !days.Contains(s.Date.DayOfWeek));
        weeks.Skip(1).ShouldAllBe(w => w.Sessions.Count(s => s.Kind == MaintenanceSessionKind.Strength) == 1);
        weeks.Skip(1).ShouldAllBe(w => w.Sessions.Count(s => s.Kind == MaintenanceSessionKind.LongerEasyRun) == (daysPerWeek >= 3 ? 1 : 0));
    }

    [Fact]
    public void The_longer_easy_run_is_on_the_last_run_day_and_strength_only_when_asked()
    {
        var days = MaintenanceGenerator.DaysFor(3, [DayOfWeek.Sunday, DayOfWeek.Tuesday, DayOfWeek.Thursday]);
        var week = MaintenanceGenerator.Build(days, includeStrength: false, Today, Today)[1];

        week.Sessions.Single(s => s.Kind == MaintenanceSessionKind.LongerEasyRun).Date.DayOfWeek.ShouldBe(DayOfWeek.Sunday);
        week.Sessions.ShouldNotContain(s => s.Kind == MaintenanceSessionKind.Strength);
    }

    [Fact]
    public void Days_default_to_the_last_plans_days_else_tuesday_thursday_saturday_sunday()
    {
        MaintenanceGenerator.DaysFor(2, null).ShouldBe([DayOfWeek.Tuesday, DayOfWeek.Saturday]);
        MaintenanceGenerator.DaysFor(4, null).ShouldBe([DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday]);
        MaintenanceGenerator.DaysFor(2, null, [DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday]).ShouldBe([DayOfWeek.Monday, DayOfWeek.Friday]);
        MaintenanceGenerator.DaysFor(3, [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday])
            .ShouldBe([DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday]);
    }

    [Fact]
    public void Two_to_four_days_and_enough_days_chosen()
    {
        Should.Throw<DomainException>(() => MaintenanceGenerator.DaysFor(1, null));
        Should.Throw<DomainException>(() => MaintenanceGenerator.DaysFor(5, null));
        Should.Throw<DomainException>(() => MaintenanceGenerator.DaysFor(3, [DayOfWeek.Monday, DayOfWeek.Friday]));
    }

    [Fact]
    public void A_plan_ends_once_and_the_same_answers_are_the_same_plan()
    {
        var plan = MaintenancePlan.Start(Guid.NewGuid(), 3, null, true, null, Today);
        plan.IsSameAs(3, null, true, null).ShouldBeTrue();
        plan.IsSameAs(2, null, true, null).ShouldBeFalse();

        plan.End(Today);
        plan.End(Today.AddDays(1));
        plan.Status.ShouldBe(MaintenanceStatus.Ended);
        plan.EndedOn.ShouldBe(Today);
        Should.Throw<DomainException>(() => plan.Change(2, null, false, null));
    }
}

public class RaceResultTests
{
    private static readonly DateOnly PlanStart = new(2026, 9, 1);
    private static readonly DateOnly Race = new(2026, 11, 1);

    private static RaceResult Record(RaceResultAnswers answers, DateOnly? today = null) =>
        RaceResult.Record(Guid.NewGuid(), Guid.NewGuid(), answers, PlanStart, today ?? Race);

    [Fact]
    public void A_result_is_on_race_day_or_after_and_not_before_the_plan()
    {
        Should.NotThrow(() => Record(new(RaceOutcome.Finished, Race)));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.Finished, Race.AddDays(1))));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.Finished, PlanStart.AddDays(-1))));
    }

    [Fact]
    public void Finish_time_distance_and_note_stay_within_bounds()
    {
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.Finished, Race, TimeSpan.FromSeconds(59))));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.Finished, Race, TimeSpan.FromHours(48.01))));
        Should.NotThrow(() => Record(new(RaceOutcome.Finished, Race, TimeSpan.FromHours(48))));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.Finished, Race, DistanceKm: 0.05)));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.Finished, Race, DistanceKm: 400.1)));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.Finished, Race, Note: new string('x', 281))));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.DidNotFinish, Race, TimeSpan.FromHours(2))));
        Should.Throw<DomainException>(() => Record(new(RaceOutcome.DidNotStart, Race, DistanceKm: 5)));
    }

    [Fact]
    public void A_finish_is_compared_with_the_goal()
    {
        var result = Record(new(RaceOutcome.Finished, Race, new TimeSpan(1, 58, 30)));

        result.VersusGoal(TimeSpan.FromHours(2)).ShouldBe(TimeSpan.FromSeconds(-90));
        result.VersusGoal(null).ShouldBeNull();
        result.WasRun.ShouldBeTrue();
        Record(new(RaceOutcome.DidNotStart, Race)).WasRun.ShouldBeFalse();
        Record(new(RaceOutcome.DidNotFinish, Race)).WasRun.ShouldBeTrue();
    }
}
