using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Tests.Activities;

namespace StartLine.Domain.Tests.Coaching;

public sealed class CurrentRunningLogTests
{
    private static readonly DateTimeOffset Now = RunBuilder.Start.AddHours(2);
    private static readonly DateOnly Day = DateOnly.FromDateTime(Now.UtcDateTime);

    private static Activity Run(double km = 10, ActivityOrigin? origin = null) => Activity.Record(
        Guid.NewGuid(), new RunBuilder().Run(km * 1000, 360).Build(), Day, [], origin ?? ActivityOrigin.Strava(42, Now, false));

    private static TickedSession Tick(Guid? activity = null, double? km = null, bool additional = true, bool unknown = true) =>
        new(Day, additional ? 0 : 6, new CheckInAnswers(CheckInStatus.Done, null, DistanceKm: km, DistanceUnreported: km is null && unknown, ActivityId: activity), additional);

    [Fact]
    public void An_unlogged_synced_run_counts_automatically_without_creating_a_durable_entry()
    {
        var run = Run();
        var current = RunningLog.WithSynced([], [run], Now).ShouldHaveSingleItem();
        current.DistanceKm.ShouldBe(10, 0.01);
        current.Source.ShouldBe(LoggedRunSource.Strava);
        current.CachedUntil.ShouldBe(run.CachedUntil);
        RunningLog.Of([], [run]).ShouldBeEmpty();
    }

    [Fact]
    public void A_linked_completion_counts_the_actual_distance_once_and_keeps_its_saved_distance_unknown()
    {
        var run = Run(); var tick = Tick(run.Id);
        var current = RunningLog.WithSynced([tick], [run], Now).ShouldHaveSingleItem();
        current.DistanceKm.ShouldBe(10, 0.01);
        current.DistanceUnreported.ShouldBeFalse();
        tick.Answers.DistanceKm.ShouldBeNull();
        RunningLog.Of([tick], [run]).ShouldHaveSingleItem().DistanceUnreported.ShouldBeTrue();
    }

    [Fact]
    public void Own_measurements_win_without_double_counting_and_remain_after_cache_expiry()
    {
        var run = Run(); var tick = Tick(run.Id, 12);
        foreach (var now in new[] { Now, Now.AddDays(8) })
        {
            var current = RunningLog.WithSynced([tick], [run], now).ShouldHaveSingleItem();
            current.DistanceKm.ShouldBe(12);
            current.Source.ShouldBe(LoggedRunSource.Ticked);
            current.CachedUntil.ShouldBeNull();
        }
    }

    [Fact]
    public void Missing_distance_stays_unknown_when_linked_strava_details_expire()
    {
        var run = Run();
        RunningLog.WithSynced([], [run], Now.AddDays(7)).ShouldBeEmpty();
        var current = RunningLog.WithSynced([Tick(run.Id)], [run], Now.AddDays(7)).ShouldHaveSingleItem();
        current.DistanceUnreported.ShouldBeTrue();
        current.Source.ShouldBe(LoggedRunSource.Ticked);
    }

    [Fact]
    public void Multiple_runs_on_one_day_and_a_separate_manual_additional_run_are_preserved()
    {
        var first = Run(); var second = Run(3); var manual = Tick(km: 2);
        var log = RunningLog.WithSynced([Tick(first.Id), manual], [first, second], Now);
        log.Count.ShouldBe(3);
        log.Sum(r => r.DistanceKm).ShouldBe(15, 0.01);
    }

    [Fact]
    public void A_plain_planned_tick_does_not_add_planned_kilometres_on_top_of_a_recorded_run()
    {
        var run = Run();
        RunningLog.WithSynced([Tick(additional: false, unknown: false)], [run], Now).ShouldHaveSingleItem().DistanceKm.ShouldBe(10, 0.01);
    }

    [Fact]
    public void An_upload_and_its_linked_entry_are_one_run_with_the_runners_own_correction()
    {
        var run = Run(origin: ActivityOrigin.Upload);
        var log = RunningLog.WithSynced([Tick(run.Id, 12)], [run], Now).ShouldHaveSingleItem();
        log.DistanceKm.ShouldBe(12);
        log.CachedUntil.ShouldBeNull();
    }

    [Fact]
    public void A_repeated_activity_or_links_across_plan_history_do_not_duplicate_a_run()
    {
        var run = Run();
        var older = Tick(run.Id, 11) with { UpdatedAt = Now.AddHours(-1) };
        var newer = Tick(run.Id, 12) with { UpdatedAt = Now };
        RunningLog.WithSynced([older, newer, Tick(run.Id)], [run, run], Now).ShouldHaveSingleItem().DistanceKm.ShouldBe(12);
    }
}
