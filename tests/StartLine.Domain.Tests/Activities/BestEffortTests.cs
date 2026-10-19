using StartLine.Domain.Activities;

namespace StartLine.Domain.Tests.Activities;

public sealed class BestEffortTests
{
    private static TimeSpan? Effort(Activity run, double metres) =>
        run.BestEfforts.SingleOrDefault(e => Math.Abs(e.DistanceMetres - metres) < 0.5)?.Elapsed;

    [Fact]
    public void A_steady_run_has_an_effort_for_every_standard_distance_it_covers_and_none_beyond()
    {
        var run = new RunBuilder().Run(10_000, 300).Record();

        Effort(run, 400)!.Value.TotalSeconds.ShouldBe(120, tolerance: 0.5);
        Effort(run, 1000)!.Value.TotalSeconds.ShouldBe(300, tolerance: 0.5);
        Effort(run, 1609.344)!.Value.TotalSeconds.ShouldBe(482.8, tolerance: 0.5);
        Effort(run, 5000)!.Value.TotalSeconds.ShouldBe(1500, tolerance: 0.5);
        Effort(run, 10_000)!.Value.TotalSeconds.ShouldBe(3000, tolerance: 0.5);
        Effort(run, 15_000).ShouldBeNull();
        run.BestEfforts.Count.ShouldBe(7);
    }

    [Fact]
    public void The_fastest_stretch_is_found_even_when_it_straddles_two_splits()
    {
        var run = new RunBuilder().Run(1500, 330).Run(1000, 270).Run(1500, 330).Record();

        Effort(run, 1000)!.Value.TotalSeconds.ShouldBe(270, tolerance: 0.5);
        Effort(run, 400)!.Value.TotalSeconds.ShouldBe(108, tolerance: 0.5);
        run.Splits.ShouldAllBe(s => s.PaceSecondsPerKm > 280);
    }

    [Fact]
    public void Stopping_during_a_stretch_counts_against_it_like_a_race_clock()
    {
        var run = new RunBuilder().Run(2500, 300).Stand(60).Run(2500, 300).Record();

        Effort(run, 5000)!.Value.TotalSeconds.ShouldBe(1560, tolerance: 1);
        Effort(run, 1000)!.Value.TotalSeconds.ShouldBe(300, tolerance: 0.5);
    }

    [Fact]
    public void A_marathon_short_by_the_watch_gets_no_marathon_effort()
    {
        var run = new RunBuilder().Run(42_100, 330).Record();

        Effort(run, 42_195).ShouldBeNull();
        Effort(run, 21_097.5).ShouldNotBeNull();
    }

    [Fact]
    public void Matching_your_fastest_time_still_counts_as_a_personal_best()
    {
        var effort = new BestEffort(5000, TimeSpan.FromMinutes(25));

        BestEfforts.IsPersonalBest(effort, new Dictionary<double, TimeSpan> { [5000] = TimeSpan.FromMinutes(25) }).ShouldBeTrue();
        BestEfforts.IsPersonalBest(effort, new Dictionary<double, TimeSpan> { [5000] = TimeSpan.FromMinutes(24) }).ShouldBeFalse();
        BestEfforts.IsPersonalBest(effort, new Dictionary<double, TimeSpan>()).ShouldBeTrue();
    }

    [Fact]
    public void Every_standard_distance_has_a_name()
    {
        StandardDistance.Find(21_097.5)!.Name.ShouldBe("Half marathon");
        StandardDistance.Find(1234).ShouldBeNull();
        StandardDistance.All.Select(d => d.Metres).ShouldBeInOrder();
    }
}
