using StartLine.Domain.Activities;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Tests.Activities;

public sealed class PlanMatchTests
{
    private static readonly PlannedSessionMatch EasyTen = new("Two Oceans", SessionType.Easy, "Easy run", 10, 340, 370);
    private static readonly PlannedSessionMatch LongRun = new("Comrades", SessionType.LongRun, "Long run", 24, 360, 390);
    private static readonly PlannedSessionMatch Strength = new("Comrades", SessionType.Strength, "Strength", 0, null, null);

    [Fact]
    public void A_run_on_a_rest_day_matches_nothing() =>
        new RunBuilder().Run(5000, 300).Record().PlannedSession.ShouldBeNull();

    [Fact]
    public void Strength_sessions_never_match_a_run() =>
        new RunBuilder().Run(5000, 300).Record(Strength).PlannedSession.ShouldBeNull();

    [Fact]
    public void With_two_plans_the_session_closest_in_distance_wins()
    {
        new RunBuilder().Run(11_000, 350).Record(LongRun, EasyTen, Strength).PlannedSession.ShouldBe(EasyTen);
        new RunBuilder().Run(22_000, 370).Record(EasyTen, LongRun).PlannedSession.ShouldBe(LongRun);
    }

    [Fact]
    public void Running_inside_the_planned_pace_range_is_on_target()
    {
        var comparison = new RunBuilder().Run(10_500, 355).Record(EasyTen).ComparedWithPlan!;

        comparison.Pace.ShouldBe(PaceVerdict.OnTarget);
        comparison.SecondsPerKmOffTarget.ShouldBe(0);
        comparison.DistanceDifferenceKm.ShouldBe(0.5, tolerance: 0.01);
    }

    [Fact]
    public void Running_an_easy_day_too_fast_is_flagged_by_how_much()
    {
        var comparison = new RunBuilder().Run(10_000, 320).Record(EasyTen).ComparedWithPlan!;

        comparison.Pace.ShouldBe(PaceVerdict.Faster);
        comparison.SecondsPerKmOffTarget.ShouldBe(20, tolerance: 0.5);
    }

    [Fact]
    public void Running_slower_than_the_range_is_flagged_by_how_much()
    {
        var comparison = PlanComparison.Of(EasyTen, 10, 385);

        comparison.Pace.ShouldBe(PaceVerdict.Slower);
        comparison.SecondsPerKmOffTarget.ShouldBe(15);
    }

    [Fact]
    public void A_session_without_a_pace_has_no_target() =>
        PlanComparison.Of(EasyTen with { FastestPaceSecondsPerKm = null, SlowestPaceSecondsPerKm = null }, 10, 300)
            .Pace.ShouldBe(PaceVerdict.NoTarget);

    [Fact]
    public void An_unplanned_run_has_nothing_to_compare() =>
        new RunBuilder().Run(5000, 300).Record().ComparedWithPlan.ShouldBeNull();
}
