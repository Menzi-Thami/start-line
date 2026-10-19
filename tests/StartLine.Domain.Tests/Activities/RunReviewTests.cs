using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Activities;

public sealed class RunReviewTests
{
    // Paces in seconds per km. Easy 330–360, tempo 290–300, interval 245–255, goal pace 300.
    private static readonly PlannedSessionMatch EasySix =
        new("Spring 10K", SessionType.Easy, "Easy run", 6, 330, 360, PaceZone.Easy, EasyFastestPaceSecondsPerKm: 330, EasySlowestPaceSecondsPerKm: 360);

    private static readonly PlannedSessionMatch Tempo = new(
        "Spring 10K", SessionType.Tempo, "Tempo run", 7.5, 290, 300, PaceZone.Tempo,
        WorkShape.Continuous, WorkKm: 4, PaceZone.Tempo, 290, 300, EasyFastestPaceSecondsPerKm: 330, EasySlowestPaceSecondsPerKm: 360,
        NextTitle: "Easy run", NextDate: new DateOnly(2026, 10, 20));

    private static readonly PlannedSessionMatch Intervals = new(
        "Spring 10K", SessionType.Intervals, "Intervals", 9, 245, 255, PaceZone.Interval,
        WorkShape.Reps, WorkKm: 5, PaceZone.Interval, 245, 255, RepMetres: 1000, 330, 360);

    private static readonly PlannedSessionMatch Hills = new(
        "Spring 10K", SessionType.Hills, "Hill repeats", 6, 245, 255, PaceZone.Interval, WorkShape.ByEffort);

    private static readonly PlannedSessionMatch LongRun = new(
        "Spring marathon", SessionType.LongRun, "Long run", 10, 350, 390, PaceZone.LongRun, GoalPaceSecondsPerKm: 300);

    [Fact]
    public void An_easy_run_kept_easy_is_in_zone_every_km_with_no_fast_start_or_fade()
    {
        var review = new RunBuilder().Run(6000, 345).Record(EasySix).Review();

        review.Splits.ShouldAllBe(s => s.Role == SplitRole.Steady && s.Fit == ZoneFit.In && s.Zone == PaceZone.Easy);
        review.Plan!.Pace.ShouldBe(PaceVerdict.OnTarget);
        review.Plan.Judged.ShouldBe(JudgedPart.WholeRun);
        review.StartedFastBySecondsPerKm.ShouldBeNull();
        review.FadeFromSplit.ShouldBeNull();
        review.Distance.ShouldBe(DistanceFit.AsPlanned);
    }

    [Fact]
    public void An_easy_run_run_fast_is_flagged_km_by_km_and_as_a_fast_start()
    {
        var review = new RunBuilder().Run(6000, 310).Record(EasySix).Review();

        review.Splits.ShouldAllBe(s => s.Fit == ZoneFit.Faster);
        review.Splits[0].SecondsPerKmOffZone.ShouldBe(18, tolerance: 1);
        review.StartedFastBySecondsPerKm!.Value.ShouldBe(20, tolerance: 1);
        review.Plan!.Pace.ShouldBe(PaceVerdict.Faster);
    }

    [Fact]
    public void A_few_seconds_outside_the_zone_still_counts_as_in_it() =>
        new RunBuilder().Run(6000, 361).Record(EasySix).Review().Splits.ShouldAllBe(s => s.Fit == ZoneFit.In);

    [Fact]
    public void A_tempo_is_judged_on_its_work_block_not_the_warm_up()
    {
        var run = new RunBuilder().Run(2000, 345).Run(4000, 295).Run(1500, 350).Record(Tempo);
        var review = run.Review();

        run.Work!.StartMetres.ShouldBe(2000, tolerance: 5);
        review.Plan!.Judged.ShouldBe(JudgedPart.WorkBlock);
        review.Plan.JudgedPaceSecondsPerKm!.Value.ShouldBe(295, tolerance: 0.5);
        review.Plan.Pace.ShouldBe(PaceVerdict.OnTarget);
        review.Splits.Select(s => s.Role).ShouldBe(
            [SplitRole.WarmUp, SplitRole.WarmUp, SplitRole.Work, SplitRole.Work, SplitRole.Work, SplitRole.Work, SplitRole.CoolDown, SplitRole.CoolDown]);
        review.Splits.Where(s => s.Role == SplitRole.WarmUp).ShouldAllBe(s => s.Zone == PaceZone.Easy && s.Fit == ZoneFit.In);
        review.Splits.Where(s => s.Role == SplitRole.Work).ShouldAllBe(s => s.Zone == PaceZone.Tempo && s.Fit == ZoneFit.In);
    }

    [Fact]
    public void Quickest_and_hardest_rank_only_the_work_never_the_warm_up_or_cool_down()
    {
        var review = new RunBuilder().Run(2000, 345).Run(1000, 292).Run(1000, 298).Run(1000, 295).Run(1000, 296).Run(2000, 400)
            .Record(Tempo).Review();

        review.QuickestSplit.ShouldBe(3);
        review.HardestSplit.ShouldBe(4);
    }

    [Fact]
    public void Repeats_have_no_quickest_or_hardest_km()
    {
        var builder = new RunBuilder().Run(2000, 345);
        for (var rep = 0; rep < 5; rep++)
        {
            builder.Run(1000, 250).Run(300, 420);
        }

        var review = builder.Record(Intervals).Review();

        review.QuickestSplit.ShouldBeNull();
        review.HardestSplit.ShouldBeNull();
    }

    [Fact]
    public void A_tempo_that_started_too_fast_and_faded_says_both_and_where()
    {
        var review = new RunBuilder().Run(2000, 345).Run(1000, 278).Run(1000, 288).Run(1000, 300).Run(1000, 304).Run(1500, 350)
            .Record(Tempo).Review();

        review.StartedFastBySecondsPerKm!.Value.ShouldBe(12, tolerance: 1);
        review.FadeFromSplit.ShouldBe(5);
    }

    [Fact]
    public void One_slow_hilly_km_in_a_steady_run_is_not_a_fade() =>
        new RunBuilder().Run(5000, 350).Run(1000, 400, climbMetres: 40).Run(4000, 350).Record(LongRun).Review().FadeFromSplit.ShouldBeNull();

    [Fact]
    public void A_long_run_that_slows_for_good_shows_where_the_fade_started_and_the_gap_to_goal_pace()
    {
        var review = new RunBuilder().Run(6000, 360).Run(4000, 385).Record(LongRun).Review();

        review.FadeFromSplit.ShouldBe(7);
        review.GoalPaceGapSecondsPerKm!.Value.ShouldBe(70, tolerance: 0.5);
    }

    [Fact]
    public void Repeats_are_judged_on_the_fastest_rep_and_their_km_splits_are_not_scored()
    {
        var builder = new RunBuilder().Run(2000, 345);
        for (var rep = 0; rep < 5; rep++)
        {
            builder.Run(1000, 250).Run(300, 420);
        }

        var review = builder.Run(1500, 350).Record(Intervals).Review();

        review.Plan!.Judged.ShouldBe(JudgedPart.FastestRep);
        review.Plan.JudgedPaceSecondsPerKm!.Value.ShouldBe(250, tolerance: 0.5);
        review.Plan.Pace.ShouldBe(PaceVerdict.OnTarget);
        review.Splits.ShouldAllBe(s => s.Fit == ZoneFit.Unscored);
        review.FadeFromSplit.ShouldBeNull();
    }

    [Fact]
    public void Hills_have_no_pace_a_watch_can_judge()
    {
        var review = new RunBuilder().Run(6000, 340).Record(Hills).Review();

        review.Plan!.Pace.ShouldBe(PaceVerdict.NoTarget);
        review.Plan.Judged.ShouldBe(JudgedPart.None);
        review.Splits.ShouldAllBe(s => s.Fit == ZoneFit.Unscored);
    }

    [Theory]
    [InlineData(5000, DistanceFit.ShorterThanPlanned)]
    [InlineData(5600, DistanceFit.AsPlanned)]
    [InlineData(7000, DistanceFit.LongerThanPlanned)]
    public void Distance_is_as_planned_within_ten_percent_or_half_a_km(double metres, DistanceFit fit) =>
        new RunBuilder().Run(metres, 345).Record(EasySix).Review().Distance.ShouldBe(fit);

    [Fact]
    public void An_unplanned_run_has_no_scores_but_still_shows_a_fade()
    {
        var review = new RunBuilder().Run(5000, 300).Run(4000, 330).Record().Review();

        review.Plan.ShouldBeNull();
        review.Distance.ShouldBeNull();
        review.Splits.ShouldAllBe(s => s.Fit == ZoneFit.Unscored);
        review.FadeFromSplit.ShouldBe(6);
    }

    [Fact]
    public void Heart_rate_drift_shows_when_pace_held_but_heart_rate_climbed()
    {
        var review = new RunBuilder().Run(3000, 345, heartRate: 140).Run(3000, 345, heartRate: 154).Record(EasySix).Review();

        review.HeartRateDriftPercent!.Value.ShouldBe(9.1, tolerance: 0.3);
        review.HeartRateDriftPercent.Value.ShouldBeGreaterThan(HeartRateZones.NotableDriftPercent);
    }

    [Fact]
    public void Heart_rate_drift_is_left_out_of_structured_sessions_and_short_runs()
    {
        new RunBuilder().Run(2000, 345, heartRate: 130).Run(4000, 295, heartRate: 170).Run(1500, 350).Record(Tempo).Review()
            .HeartRateDriftPercent.ShouldBeNull();
        new RunBuilder().Run(1500, 345, heartRate: 140).Run(1500, 345, heartRate: 160).Record(EasySix).Review()
            .HeartRateDriftPercent.ShouldBeNull();
    }

    [Fact]
    public void Time_at_each_heart_rate_adds_up_to_moving_time()
    {
        var run = new RunBuilder().Run(1000, 300, heartRate: 140).Stand(30).Run(1000, 300, heartRate: 160).Record();

        run.HeartRateTime.Sum(t => t.Seconds).ShouldBe(run.MovingTime.TotalSeconds, tolerance: 1);
        run.HeartRateTime.Single(t => t.Bpm == 160).Seconds.ShouldBe(300, tolerance: 1);
    }

    [Fact]
    public void Heart_rate_zones_split_time_by_share_of_max()
    {
        HeartRateTime[] time = [new(90, 60), new(120, 600), new(150, 1200), new(165, 300), new(200, 30)];

        var zones = HeartRateZones.TimeIn(time, maxHeartRate: 190);

        zones.Select(z => z.Seconds).ShouldBe([60, 600, 1200, 300, 30]);
        zones[1].FromBpm.ShouldBe(114);
        zones[4].ToBpm.ShouldBe(190);
    }
}
