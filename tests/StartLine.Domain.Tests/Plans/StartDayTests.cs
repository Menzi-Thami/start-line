using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>A runner can start their plan on the day they choose; without one, it starts the next Monday as always.</summary>
public sealed class StartDayTests
{
    // Built on Thursday 8 October for a marathon on Sunday 28 February.
    private static readonly DateOnly Today = new(2026, 10, 8);

    private static PlanParameters Marathon(DateOnly? startOn = null, int version = TrainingPlanGenerator.LatestVersion) => new(
        Distance.Marathon, TimeSpan.FromHours(4), new DateOnly(2027, 2, 28), Today,
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday], DayOfWeek.Sunday, 40,
        GeneratorVersion: version, StartOn: startOn);

    [Fact]
    public void Without_a_start_day_the_plan_starts_the_next_Monday_as_before()
    {
        var plan = TrainingPlanGenerator.Generate(Marathon());

        plan.StartDate.ShouldBe(new DateOnly(2026, 10, 12));
        plan.Weeks[0].StartDate.ShouldBe(new DateOnly(2026, 10, 12));
    }

    [Fact]
    public void A_plan_can_start_today_mid_week_with_a_short_first_week()
    {
        // A race 20 weeks out from this Monday: starting today fits within the longest useful plan.
        var plan = TrainingPlanGenerator.Generate(Marathon(startOn: Today) with { RaceDate = new DateOnly(2027, 2, 21) });

        plan.StartDate.ShouldBe(Today);
        plan.Weeks[0].StartDate.ShouldBe(new DateOnly(2026, 10, 5));
        plan.Weeks[0].Sessions.ShouldAllBe(s => s.Date >= Today);
        plan.Weeks[0].Sessions.Select(s => s.Date.DayOfWeek).ShouldBe([DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday]);
        plan.Weeks[1].StartDate.ShouldBe(new DateOnly(2026, 10, 12));
    }

    [Fact]
    public void A_plan_can_start_weeks_later_on_the_day_chosen()
    {
        var plan = TrainingPlanGenerator.Generate(Marathon(startOn: new DateOnly(2026, 11, 2)));

        plan.StartDate.ShouldBe(new DateOnly(2026, 11, 2));
        plan.Weeks.Count.ShouldBe(TrainingPlanGenerator.Generate(Marathon()).Weeks.Count - 3);
        plan.Weeks[^1].Sessions[^1].Date.ShouldBe(new DateOnly(2027, 2, 28));
    }

    [Fact]
    public void A_start_day_far_ahead_still_keeps_the_plan_to_its_longest_useful_length()
    {
        var plan = TrainingPlanGenerator.Generate(Marathon(startOn: Today) with { RaceDate = new DateOnly(2027, 9, 26) });

        plan.Weeks.Count.ShouldBe(20);
        plan.Warnings.ShouldContain(w => w.Code == "starts-later");
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(140)]
    public void A_start_day_before_today_or_too_close_to_the_race_is_rejected(int daysFromToday) =>
        Should.Throw<DomainException>(() => TrainingPlanGenerator.Generate(Marathon(startOn: Today.AddDays(daysFromToday))));

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void A_chosen_start_day_keeps_every_training_rule(int version)
    {
        var plan = TrainingPlanGenerator.Generate(Marathon(startOn: new DateOnly(2026, 10, 15), version));
        var building = plan.Weeks.Where(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak && !w.IsCutback).Skip(1).ToList();

        // From the first full week on, growth stays within about 10% (rounding headroom), and nothing runs before the start.
        building.Zip(building.Skip(1)).ShouldAllBe(pair => pair.Second.PlannedKm <= pair.First.PlannedKm * 1.12);
        plan.Weeks.SelectMany(w => w.Sessions).ShouldAllBe(s => s.Date >= new DateOnly(2026, 10, 15));
    }
}
