using StartLine.Domain.Activities;
using StartLine.Domain.Common;

namespace StartLine.Domain.Tests.Activities;

public sealed class ActivityTests
{
    [Fact]
    public void A_steady_5k_has_five_even_splits_and_matching_totals()
    {
        var run = new RunBuilder().Run(5000, secondsPerKm: 300).Record();

        run.DistanceMetres.ShouldBe(5000, tolerance: 0.01);
        run.MovingTime.TotalSeconds.ShouldBe(1500, tolerance: 0.5);
        run.ElapsedTime.TotalSeconds.ShouldBe(1500, tolerance: 0.5);
        run.PaceSecondsPerKm.ShouldBe(300, tolerance: 0.1);
        run.Splits.Count.ShouldBe(5);
        run.Splits.ShouldAllBe(s => Math.Abs(s.PaceSecondsPerKm - 300) < 0.5);
        run.Halves.Verdict.ShouldBe(PacingVerdict.Even);
    }

    [Fact]
    public void Standing_at_the_lights_counts_in_elapsed_time_but_not_moving_time_or_split_pace()
    {
        var run = new RunBuilder().Run(2500, 300).Stand(60).Run(2500, 300).Record();

        run.MovingTime.TotalSeconds.ShouldBe(1500, tolerance: 1);
        run.ElapsedTime.TotalSeconds.ShouldBe(1560, tolerance: 1);
        run.Splits[2].MovingTime.TotalSeconds.ShouldBe(300, tolerance: 1);
    }

    [Fact]
    public void The_last_split_is_the_short_remainder()
    {
        var run = new RunBuilder().Run(3400, 300).Record();

        run.Splits.Count.ShouldBe(4);
        run.Splits[3].DistanceMetres.ShouldBe(400, tolerance: 0.01);
        run.Splits[3].IsFullKilometre.ShouldBeFalse();
        run.Splits[3].PaceSecondsPerKm.ShouldBe(300, tolerance: 1);
    }

    [Fact]
    public void A_few_metres_of_drift_after_the_finish_is_not_a_split()
    {
        var run = new RunBuilder().Run(3000, 300).Run(5, 600).Record();

        run.Splits.Count.ShouldBe(3);
    }

    [Fact]
    public void Quickest_and_hardest_are_the_fastest_and_slowest_full_kilometres()
    {
        var run = new RunBuilder().Run(1000, 300).Run(1000, 290).Run(1000, 310).Run(1000, 305).Run(500, 250).Record();

        Splits.Quickest(run.Splits)!.Number.ShouldBe(2);
        Splits.Hardest(run.Splits)!.Number.ShouldBe(3);
    }

    [Fact]
    public void A_single_kilometre_has_no_quickest_or_hardest()
    {
        var run = new RunBuilder().Run(1500, 300).Record();

        Splits.Quickest(run.Splits).ShouldBeNull();
        Splits.Hardest(run.Splits).ShouldBeNull();
    }

    [Fact]
    public void Fading_in_the_second_half_is_a_positive_split()
    {
        var run = new RunBuilder().Run(5000, 300).Run(5000, 330).Record();

        run.Halves.FirstHalfPaceSecondsPerKm.ShouldBe(300, tolerance: 0.5);
        run.Halves.SecondHalfPaceSecondsPerKm.ShouldBe(330, tolerance: 0.5);
        run.Halves.SecondHalfSlowerBySecondsPerKm.ShouldBe(30, tolerance: 0.5);
        run.Halves.Verdict.ShouldBe(PacingVerdict.PositiveSplit);
    }

    [Fact]
    public void Finishing_faster_is_a_negative_split()
    {
        var run = new RunBuilder().Run(5000, 330).Run(5000, 300).Record();

        run.Halves.Verdict.ShouldBe(PacingVerdict.NegativeSplit);
    }

    [Fact]
    public void Gps_wobbling_backwards_never_takes_distance_away()
    {
        var builder = new RunBuilder().Run(1000, 300);
        builder.Add(new ActivitySample(TimeSpan.FromSeconds(301), 995)).Run(1000, 300);

        var run = builder.Record();

        run.DistanceMetres.ShouldBe(1995, tolerance: 0.01);
    }

    [Fact]
    public void Samples_out_of_order_are_put_back_in_time_order()
    {
        var builder = new RunBuilder();
        builder.Add(new ActivitySample(TimeSpan.FromSeconds(600), 2000)).Add(new ActivitySample(TimeSpan.FromSeconds(300), 1000));

        var run = builder.Record();

        run.DistanceMetres.ShouldBe(2000);
        run.Splits.Count.ShouldBe(2);
    }

    [Fact]
    public void The_watch_climb_is_preferred_to_one_worked_out_from_altitude()
    {
        var run = new RunBuilder().Run(5000, 300, climbMetres: 80).Device(new DeviceTotals(AscentMetres: 74)).Record();

        run.ElevationGainMetres.ShouldBe(74);
    }

    [Fact]
    public void Without_a_watch_total_the_climb_comes_from_altitude()
    {
        var run = new RunBuilder().Run(2000, 300, climbMetres: 40).Run(2000, 300, climbMetres: -40).Record();

        run.ElevationGainMetres!.Value.ShouldBe(40, tolerance: 3);
        run.Splits[0].ElevationChangeMetres!.Value.ShouldBe(20, tolerance: 0.5);
        run.Splits[3].ElevationChangeMetres!.Value.ShouldBe(-20, tolerance: 0.5);
    }

    [Fact]
    public void Altitude_jitter_on_the_flat_is_not_climbing()
    {
        var builder = new RunBuilder();
        for (var s = 1; s <= 600; s++)
        {
            builder.Add(new ActivitySample(TimeSpan.FromSeconds(s), s * 3.3, 100 + (s % 2 == 0 ? 1 : -1)));
        }

        builder.Record().ElevationGainMetres.ShouldBe(0);
    }

    [Fact]
    public void Heart_rate_comes_from_the_watch_when_it_has_totals_and_from_the_samples_otherwise()
    {
        new RunBuilder().Run(2000, 300, heartRate: 150).Device(new DeviceTotals(AverageHeartRate: 148, MaxHeartRate: 171, Calories: 160))
            .Record().ShouldSatisfyAllConditions(
                r => r.AverageHeartRate.ShouldBe(148),
                r => r.MaxHeartRate.ShouldBe(171),
                r => r.Calories.ShouldBe(160));

        new RunBuilder().Run(1000, 300, heartRate: 140).Run(1000, 300, heartRate: 160)
            .Record().ShouldSatisfyAllConditions(
                r => r.AverageHeartRate.ShouldBe(150),
                r => r.MaxHeartRate.ShouldBe(160),
                r => r.Calories.ShouldBeNull(),
                r => r.Splits[1].AverageHeartRate.ShouldBe(160));
    }

    [Fact]
    public void A_run_without_heart_rate_or_altitude_leaves_them_empty()
    {
        var builder = new RunBuilder();
        for (var s = 1; s <= 600; s++)
        {
            builder.Add(new ActivitySample(TimeSpan.FromSeconds(s), s * 3.3));
        }

        var run = builder.Record();

        run.MaxHeartRate.ShouldBe(140); // only the builder's first sample carries one
        run.ElevationGainMetres.ShouldBeNull();
    }

    [Fact]
    public void Only_runs_can_be_imported() =>
        Should.Throw<DomainException>(() => new RunBuilder().Run(5000, 150).Kind(ActivityKind.Other).Record());

    [Fact]
    public void A_watch_started_by_accident_is_too_short_to_import() =>
        Should.Throw<DomainException>(() => new RunBuilder().Run(150, 300).Record());

    [Fact]
    public void A_recording_without_distance_cannot_be_imported() =>
        Should.Throw<DomainException>(() => Activity.Record(Guid.NewGuid(),
            new ActivityRecording(RunBuilder.Start, ActivityKind.Run, [], DeviceTotals.None), new DateOnly(2026, 10, 18), []));

    [Fact]
    public void An_activity_belongs_to_a_runner() =>
        Should.Throw<DomainException>(() => Activity.Record(Guid.Empty, new RunBuilder().Run(5000, 300).Build(), new DateOnly(2026, 10, 18), []));

    [Fact]
    public void The_start_is_stored_in_utc_and_the_local_date_as_given()
    {
        var recording = new RunBuilder().Run(5000, 300).Build() with { StartedAt = new DateTimeOffset(2026, 10, 18, 5, 0, 0, TimeSpan.FromHours(2)) };

        var run = Activity.Record(Guid.NewGuid(), recording, new DateOnly(2026, 10, 18), []);

        run.StartedAt.Offset.ShouldBe(TimeSpan.Zero);
        run.StartedAt.UtcDateTime.Hour.ShouldBe(3);
        run.LocalDate.ShouldBe(new DateOnly(2026, 10, 18));
    }
}

public sealed class HeartRateRemovalTests
{
    [Fact]
    public void A_recording_without_heart_rate_keeps_everything_else()
    {
        var recording = new RunBuilder().Run(3000, 300, climbMetres: 20, heartRate: 150)
            .Device(new DeviceTotals(AscentMetres: 21, Calories: 200, AverageHeartRate: 150, MaxHeartRate: 160)).Build();

        var without = recording.WithoutHeartRate();

        without.Samples.ShouldAllBe(s => s.HeartRate == null);
        without.Samples.Select(s => s.DistanceMetres).ShouldBe(recording.Samples.Select(s => s.DistanceMetres));
        without.Device.ShouldBe(new DeviceTotals(AscentMetres: 21, Calories: 200));
    }

    [Fact]
    public void A_run_recorded_without_heart_rate_has_none_anywhere()
    {
        var run = Activity.Record(Guid.NewGuid(), new RunBuilder().Run(5000, 300, heartRate: 150).Build().WithoutHeartRate(),
            new DateOnly(2026, 10, 18), []);

        run.AverageHeartRate.ShouldBeNull();
        run.MaxHeartRate.ShouldBeNull();
        run.HeartRateDriftPercent.ShouldBeNull();
        run.HeartRateTime.ShouldBeEmpty();
        run.Splits.ShouldAllBe(s => s.AverageHeartRate == null);
        run.DistanceMetres.ShouldBe(5000, tolerance: 0.01);
    }

    [Fact]
    public void Forgetting_heart_rate_clears_it_from_a_stored_run_and_keeps_the_splits()
    {
        var run = new RunBuilder().Run(3000, 300, heartRate: 140).Run(3000, 300, heartRate: 160).Record();
        run.Splits.ShouldAllBe(s => s.AverageHeartRate != null);

        run.ForgetHeartRate();

        run.AverageHeartRate.ShouldBeNull();
        run.MaxHeartRate.ShouldBeNull();
        run.HeartRateDriftPercent.ShouldBeNull();
        run.HeartRateTime.ShouldBeEmpty();
        run.Splits.Count.ShouldBe(6);
        run.Splits.ShouldAllBe(s => s.AverageHeartRate == null && s.MovingTime.TotalSeconds > 0);
    }
}
