using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>Inputs an independent review showed could crash the generator. Each must now be a clean DomainException.</summary>
public sealed class ReviewRegressionTests
{
    private static readonly DateOnly Today = new(2026, 10, 8);

    private static PlanParameters Valid(double km = 42.195) => new(
        Distance.FromKilometres(km),
        TimeSpan.FromHours(km > 45 ? 10 : 4),
        new DateOnly(2027, 6, 13),
        Today,
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
        DayOfWeek.Sunday,
        40);

    [Fact]
    public void A_race_at_the_end_of_the_calendar_is_rejected_not_overflowed() =>
        Should.Throw<DomainException>(() => TrainingPlanGenerator.Generate(Valid() with { RaceDate = DateOnly.MaxValue }));

    [Fact]
    public void A_race_more_than_two_years_out_is_rejected() =>
        Should.Throw<DomainException>(() => TrainingPlanGenerator.Generate(Valid() with { RaceDate = Today.AddYears(2).AddDays(1) }));

    [Fact]
    public void Values_that_are_not_days_of_the_week_are_rejected() =>
        Should.Throw<DomainException>(() => TrainingPlanGenerator.Generate(Valid() with
        {
            RunDays = [DayOfWeek.Monday, (DayOfWeek)8, (DayOfWeek)15],
            LongRunDay = DayOfWeek.Monday,
        }));

    [Fact]
    public void An_undefined_strength_day_is_rejected() =>
        Should.Throw<DomainException>(() => TrainingPlanGenerator.Generate(Valid() with { StrengthDays = [(DayOfWeek)(-1)] }));

    [Fact]
    public void A_long_ultra_race_week_is_no_lighter_per_run_than_a_marathon()
    {
        var comrades = TrainingPlanGenerator.Generate(Valid(90));

        comrades.Weeks[^1].Sessions.Where(s => s.Type is SessionType.Easy or SessionType.Recovery)
            .Max(s => s.DistanceKm).ShouldBeGreaterThan(6);
    }
}
