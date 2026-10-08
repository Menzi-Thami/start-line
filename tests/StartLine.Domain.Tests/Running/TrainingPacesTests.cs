using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Running;

public sealed class TrainingPacesTests
{
    public static TheoryData<double, double> Goals => new()
    {
        { 5, 25 },
        { 10, 55 },
        { 21.0975, 120 },
        { 42.195, 240 },
        { 90, 660 },
    };

    [Theory]
    [MemberData(nameof(Goals))]
    public void Zones_get_faster_from_recovery_to_interval(double km, double goalMinutes)
    {
        var paces = TrainingPaces.FromGoal(Distance.FromKilometres(km), TimeSpan.FromMinutes(goalMinutes));

        double Mid(PaceZone zone) => paces[zone].Midpoint.SecondsPerKilometre;
        Mid(PaceZone.Recovery).ShouldBeGreaterThan(Mid(PaceZone.Easy));
        Mid(PaceZone.Easy).ShouldBeGreaterThan(Mid(PaceZone.LongRun));
        Mid(PaceZone.LongRun).ShouldBeGreaterThan(Mid(PaceZone.Tempo));
        Mid(PaceZone.Tempo).ShouldBeGreaterThan(Mid(PaceZone.Interval));
    }

    [Theory]
    [MemberData(nameof(Goals))]
    public void Every_range_runs_from_faster_to_slower(double km, double goalMinutes)
    {
        var paces = TrainingPaces.FromGoal(Distance.FromKilometres(km), TimeSpan.FromMinutes(goalMinutes));

        paces.Values.ShouldAllBe(r => r.Fastest.SecondsPerKilometre <= r.Slowest.SecondsPerKilometre);
    }

    [Fact]
    public void Race_zone_is_exactly_goal_pace()
    {
        var paces = TrainingPaces.FromGoal(Distance.HalfMarathon, TimeSpan.FromHours(2));

        paces[PaceZone.Race].Fastest.SecondsPerKilometre.ShouldBe(7200 / 21.0975, tolerance: 0.001);
        paces[PaceZone.Race].Slowest.ShouldBe(paces[PaceZone.Race].Fastest);
    }

    [Fact]
    public void Easy_pace_for_a_two_hour_half_is_comfortably_slower_than_goal_pace()
    {
        var paces = TrainingPaces.FromGoal(Distance.HalfMarathon, TimeSpan.FromHours(2));

        // Goal pace is about 5:41/km; easy running should sit well over a minute slower.
        paces[PaceZone.Easy].Fastest.SecondsPerKilometre.ShouldBeGreaterThan(341 + 45);
    }
}
