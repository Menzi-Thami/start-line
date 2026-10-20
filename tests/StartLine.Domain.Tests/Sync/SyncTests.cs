using StartLine.Domain.Activities;
using StartLine.Domain.Common;
using StartLine.Domain.Sync;
using StartLine.Domain.Tests.Activities;

namespace StartLine.Domain.Tests.Sync;

public sealed class SyncJobTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 6, 0, 0, TimeSpan.Zero);

    private static SyncJob Fetch() => SyncJob.Create(Guid.NewGuid(), SyncProvider.Strava, SyncJobKind.FetchActivity, 42, SyncPriority.Live, Now);

    [Fact]
    public void A_new_job_is_due_straight_away_unless_booked_for_later()
    {
        Fetch().IsDue(Now).ShouldBeTrue();
        SyncJob.Create(Guid.NewGuid(), SyncProvider.Strava, SyncJobKind.Refresh, null, SyncPriority.Refresh, Now, Now.AddDays(1)).IsDue(Now).ShouldBeFalse();
    }

    [Fact]
    public void Failed_attempts_back_off_1m_5m_30m_2h_12h_then_stop()
    {
        var job = Fetch();
        var waits = new List<TimeSpan>();
        var at = Now;
        for (var i = 0; i < SyncJob.RetryDelays.Count; i++)
        {
            job.Fail(at, "Strava answered 503");
            waits.Add(job.NotBefore - at);
            at = job.NotBefore;
        }

        waits.ShouldBe([TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30), TimeSpan.FromHours(2), TimeSpan.FromHours(12)]);
        job.Failed.ShouldBeFalse();

        job.Fail(at, "still down");

        job.Failed.ShouldBeTrue();
        job.IsDue(at.AddYears(1)).ShouldBeFalse();
    }

    [Fact]
    public void Waiting_for_the_rate_limit_uses_no_attempt_and_never_brings_a_job_forward()
    {
        var job = Fetch();
        job.Defer(Now.AddMinutes(15));
        job.Defer(Now.AddMinutes(5));

        job.Attempts.ShouldBe(0);
        job.NotBefore.ShouldBe(Now.AddMinutes(15));
    }

    [Fact]
    public void Long_errors_are_cut_to_fit()
    {
        var job = Fetch();
        job.Fail(Now, new string('x', 2000));

        job.LastError!.Length.ShouldBe(SyncJob.MaxErrorLength);
    }

    [Fact]
    public void A_job_about_one_run_needs_its_id()
    {
        Should.Throw<DomainException>(() => SyncJob.Create(Guid.NewGuid(), SyncProvider.Strava, SyncJobKind.FetchActivity, null, SyncPriority.Live, Now));
        Should.Throw<DomainException>(() => SyncJob.Create(Guid.Empty, SyncProvider.Strava, SyncJobKind.Backfill, null, SyncPriority.Backfill, Now));
    }

    [Fact]
    public void A_run_that_just_finished_goes_before_backfill_and_refresh() =>
        new[] { SyncPriority.Refresh, SyncPriority.Backfill, SyncPriority.Live, SyncPriority.CatchUp, SyncPriority.Delete }
            .Order().ShouldBe([SyncPriority.Live, SyncPriority.Delete, SyncPriority.CatchUp, SyncPriority.Backfill, SyncPriority.Refresh]);
}

public sealed class RateLimitTests
{
    [Fact]
    public void The_short_window_reopens_on_the_next_quarter_hour()
    {
        RateLimit.NextQuarterHour(new DateTimeOffset(2026, 10, 19, 6, 7, 30, TimeSpan.Zero)).ShouldBe(new DateTimeOffset(2026, 10, 19, 6, 15, 0, TimeSpan.Zero));
        RateLimit.NextQuarterHour(new DateTimeOffset(2026, 10, 19, 6, 45, 0, TimeSpan.Zero)).ShouldBe(new DateTimeOffset(2026, 10, 19, 7, 0, 0, TimeSpan.Zero));
        RateLimit.NextQuarterHour(new DateTimeOffset(2026, 10, 19, 23, 50, 0, TimeSpan.Zero)).ShouldBe(new DateTimeOffset(2026, 10, 20, 0, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public void The_daily_limit_reopens_at_midnight_utc_whatever_the_local_offset()
    {
        var johannesburgEvening = new DateTimeOffset(2026, 10, 19, 23, 30, 0, TimeSpan.FromHours(2));

        RateLimit.NextUtcMidnight(johannesburgEvening).ShouldBe(new DateTimeOffset(2026, 10, 20, 0, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public void Background_work_stops_at_90_percent_to_leave_room_for_runners_connecting()
    {
        var now = new DateTimeOffset(2026, 10, 19, 6, 7, 0, TimeSpan.Zero);

        RateLimit.BlockedUntil(new ApiUsage(89, 100, 10, 1000), now).ShouldBeNull();
        RateLimit.BlockedUntil(new ApiUsage(90, 100, 10, 1000), now).ShouldBe(new DateTimeOffset(2026, 10, 19, 6, 15, 0, TimeSpan.Zero));
    }

    [Fact]
    public void A_spent_daily_limit_wins_over_the_short_window()
    {
        var now = new DateTimeOffset(2026, 10, 19, 6, 7, 0, TimeSpan.Zero);

        RateLimit.BlockedUntil(new ApiUsage(95, 100, 950, 1000), now).ShouldBe(new DateTimeOffset(2026, 10, 20, 0, 0, 0, TimeSpan.Zero));
    }
}

public sealed class ProviderConnectionTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 6, 0, 0, TimeSpan.Zero);

    private static ProviderConnection Connect(string scopes = "read,activity:read_all") =>
        ProviderConnection.Connect(Guid.NewGuid(), SyncProvider.Strava, 12345, scopes, new ProtectedTokens("enc-access", "enc-refresh", Now.AddHours(6)), Now);

    [Fact]
    public void Access_tokens_are_refreshed_five_minutes_before_they_run_out()
    {
        var connection = Connect();

        connection.AccessTokenNeedsRefresh(Now.AddHours(6).AddMinutes(-6)).ShouldBeFalse();
        connection.AccessTokenNeedsRefresh(Now.AddHours(6).AddMinutes(-5)).ShouldBeTrue();
    }

    [Fact]
    public void Private_runs_are_included_only_with_the_read_all_scope()
    {
        Connect("read,activity:read_all").IncludesPrivateRuns.ShouldBeTrue();
        Connect("read,activity:read").IncludesPrivateRuns.ShouldBeFalse();
    }

    [Fact]
    public void Opening_the_app_catches_up_at_most_every_ten_minutes()
    {
        var connection = Connect();

        connection.TryStartCatchUp(Now).ShouldBeTrue();
        connection.TryStartCatchUp(Now.AddMinutes(9)).ShouldBeFalse();
        connection.TryStartCatchUp(Now.AddMinutes(10)).ShouldBeTrue();
    }

    [Fact]
    public void A_connection_that_needs_reconnecting_neither_catches_up_nor_stays_broken_after_new_tokens()
    {
        var connection = Connect();
        connection.RequireReconnect();

        connection.TryStartCatchUp(Now).ShouldBeFalse();

        connection.UpdateTokens(new ProtectedTokens("a2", "r2", Now.AddHours(6)));
        connection.Status.ShouldBe(ConnectionStatus.Active);
        connection.RefreshToken.ShouldBe("r2");
    }

    [Fact]
    public void A_connection_needs_a_runner_an_athlete_and_both_tokens()
    {
        var tokens = new ProtectedTokens("a", "r", Now);
        Should.Throw<DomainException>(() => ProviderConnection.Connect(Guid.Empty, SyncProvider.Strava, 1, "read", tokens, Now));
        Should.Throw<DomainException>(() => ProviderConnection.Connect(Guid.NewGuid(), SyncProvider.Strava, 0, "read", tokens, Now));
        Should.Throw<DomainException>(() => ProviderConnection.Connect(Guid.NewGuid(), SyncProvider.Strava, 1, "read", tokens with { RefreshToken = "" }, Now));
    }
}

public sealed class StravaCacheTests
{
    private static readonly DateTimeOffset FetchedAt = new(2026, 10, 19, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_synced_run_is_kept_seven_days_from_when_it_was_fetched()
    {
        var run = new RunBuilder().Run(5000, 330).Record(ActivityOrigin.Strava(987, FetchedAt, recordedOnGarmin: true));

        run.Source.ShouldBe(ActivitySource.Strava);
        run.ExternalId.ShouldBe("987");
        run.RecordedOnGarmin.ShouldBeTrue();
        run.CachedUntil.ShouldBe(FetchedAt.AddDays(7));
        StravaCache.HasLapsed(run.CachedUntil, FetchedAt.AddDays(7).AddSeconds(-1)).ShouldBeFalse();
        StravaCache.HasLapsed(run.CachedUntil, FetchedAt.AddDays(7)).ShouldBeTrue();
    }

    [Fact]
    public void Uploads_never_lapse_and_are_never_refreshed()
    {
        var run = new RunBuilder().Run(5000, 330).Record();

        run.Source.ShouldBe(ActivitySource.Upload);
        run.CachedUntil.ShouldBeNull();
        StravaCache.HasLapsed(run.CachedUntil, FetchedAt.AddYears(5)).ShouldBeFalse();
        StravaCache.IsDueForRefresh(run.CachedUntil, FetchedAt.AddYears(5)).ShouldBeFalse();
    }

    [Fact]
    public void A_synced_run_is_fetched_again_once_less_than_three_days_are_left()
    {
        var until = FetchedAt + StravaCache.Lifetime;

        StravaCache.IsDueForRefresh(until, FetchedAt.AddDays(4).AddSeconds(-1)).ShouldBeFalse();
        StravaCache.IsDueForRefresh(until, FetchedAt.AddDays(4).AddSeconds(1)).ShouldBeTrue();
    }

    [Fact]
    public void Refreshing_a_synced_run_keeps_its_id_and_takes_the_new_numbers_and_cache_date()
    {
        var runner = Guid.NewGuid();
        var date = DateOnly.FromDateTime(RunBuilder.Start.UtcDateTime);
        var first = Activity.Record(runner, new RunBuilder().Run(5000, 330).Build(), date, [], ActivityOrigin.Strava(987, FetchedAt, false));
        var edited = Activity.Record(runner, new RunBuilder().Run(6000, 320).Build(), date, [], ActivityOrigin.Strava(987, FetchedAt.AddDays(5), false));

        var id = first.Id;
        first.RefreshFrom(edited);

        first.Id.ShouldBe(id);
        first.DistanceMetres.ShouldBe(6000, tolerance: 0.01);
        first.Splits.Count.ShouldBe(6);
        first.CachedUntil.ShouldBe(FetchedAt.AddDays(12));
    }

    [Fact]
    public void Only_the_same_synced_run_can_refresh_another()
    {
        var runner = Guid.NewGuid();
        var date = DateOnly.FromDateTime(RunBuilder.Start.UtcDateTime);
        var upload = Activity.Record(runner, new RunBuilder().Run(5000, 330).Build(), date, []);
        var synced = Activity.Record(runner, new RunBuilder().Run(5000, 330).Build(), date, [], ActivityOrigin.Strava(1, FetchedAt, false));
        var other = Activity.Record(runner, new RunBuilder().Run(5000, 330).Build(), date, [], ActivityOrigin.Strava(2, FetchedAt, false));

        Should.Throw<DomainException>(() => upload.RefreshFrom(synced));
        Should.Throw<DomainException>(() => synced.RefreshFrom(other));
    }

    [Fact]
    public void A_strava_run_needs_its_strava_id() =>
        Should.Throw<DomainException>(() => ActivityOrigin.Strava(0, FetchedAt, false));
}
