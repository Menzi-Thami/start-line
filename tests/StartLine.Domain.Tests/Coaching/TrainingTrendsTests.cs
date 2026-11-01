using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Coaching;

public sealed class TrainingTrendsTests
{
    // A Sunday, so the current week is complete and the windows fall on whole weeks.
    private static readonly DateOnly Today = new(2026, 11, 1);

    private static LoggedRun Logged(int daysAgo, double km, LoggedRunSource source = LoggedRunSource.Uploaded) => new(Today.AddDays(-daysAgo), km, source);

    /// <summary>Four runs a week of the given distance, every week back to the given number of weeks.</summary>
    private static List<LoggedRun> Steady(int weeks, double km) =>
        [.. Enumerable.Range(0, weeks * 7).Where(d => d % 7 is 0 or 2 or 4 or 6).Select(d => Logged(d, km))];

    private static PlannedSession Session(int daysAgo, SessionType type = SessionType.Easy) =>
        new(Today.AddDays(-daysAgo), type, "", "", "", 8, PaceZone.Easy);

    private static TrendRun Run(int daysAgo, double km, double minutesPerKm, int? heart = null, ActivitySource source = ActivitySource.Upload, SessionType? type = SessionType.Easy) =>
        new(Guid.NewGuid(), Today.AddDays(-daysAgo), km, TimeSpan.FromMinutes(km * minutesPerKm), heart, source, type);

    [Fact]
    public void A_sudden_jump_in_the_last_week_holds_volume_and_says_by_how_much()
    {
        // 20 km a week for a month, then 40 km in the last 7 days.
        List<LoggedRun> logged = [.. Steady(5, 5).Where(r => r.Date < Today.AddDays(-6)), .. Enumerable.Range(0, 4).Select(d => Logged(d, 10))];
        var trends = TrainingTrends.Of(Today, logged, [], [], []);
        trends.Load.Signal.ShouldBe(LoadSignal.RisingFast);
        trends.Load.RecentKm.ShouldBe(40);
        trends.Load.BaselineWeeklyKm.ShouldBe(20);
        trends.Load.ChangePercent.ShouldBe(100);
        trends.NextStep.ShouldBe(NextStep.HoldVolume);
        trends.Reasons.ShouldBe([NextStepReason.LoadSpike]);
    }

    [Fact]
    public void Too_little_history_gives_no_load_verdict_and_asks_for_more_logs()
    {
        var trends = TrainingTrends.Of(Today, [Logged(1, 8), Logged(9, 8)], [], [], []);
        trends.Load.Signal.ShouldBe(LoadSignal.NotEnoughHistory);
        trends.Load.ChangePercent.ShouldBeNull();
        trends.Gaps.ShouldContain(InsightGap.FewWeeks);
        trends.NextStep.ShouldBe(NextStep.LogMore);
        trends.Weeks.Count.ShouldBe(TrainingTrends.Weeks);
        trends.Weeks[^1].IsCurrent.ShouldBeTrue();
    }

    [Fact]
    public void A_session_counts_as_done_when_ticked_uploaded_or_matched_by_a_held_Strava_run()
    {
        List<PlannedSession> sessions = [Session(3), Session(5), Session(8), Session(10), Session(12)];
        List<TrendCheckIn> checkIns =
        [
            new(Today.AddDays(-3), SessionType.Easy, CheckInStatus.Done, 3, null, null, false),
            new(Today.AddDays(-5), SessionType.Easy, CheckInStatus.Skipped, null, null, null, false),
        ];
        List<TrendRun> runs = [Run(8, 8, 6), Run(10, 8, 6, source: ActivitySource.Strava)];
        var adherence = TrainingTrends.Of(Today, Steady(6, 5), sessions, checkIns, runs).Adherence;
        // The Strava run 10 days ago completes its session while it is held (computed on read, never stored).
        adherence.ShouldBe(new SessionAdherence(5, 3, 1, 1, 0.6));
    }

    [Fact]
    public void Missing_most_sessions_holds_volume_rather_than_building()
    {
        List<PlannedSession> sessions = [Session(2), Session(4), Session(6), Session(9)];
        List<TrendCheckIn> checkIns = [new(Today.AddDays(-2), SessionType.Easy, CheckInStatus.Done, 3, null, null, false)];
        var trends = TrainingTrends.Of(Today, Steady(6, 5), sessions, checkIns, []);
        trends.NextStep.ShouldBe(NextStep.HoldVolume);
        trends.Reasons.ShouldBe([NextStepReason.MissedSessions]);
    }

    [Fact]
    public void Easy_pace_compares_runs_rated_easy_and_leaves_hard_ones_out()
    {
        List<TrendRun> runs =
        [
            Run(3, 8, 5.5, 140), Run(10, 8, 5.5, 142),
            Run(35, 8, 6, 150), Run(40, 8, 6, 152),
            // A tempo session in the recent window: rated hard, so it says nothing about easy pace.
            Run(5, 8, 4.5, 170, type: SessionType.Tempo),
        ];
        List<TrendCheckIn> checkIns = [new(runs[4].Date, SessionType.Tempo, CheckInStatus.Done, 8, null, runs[4].Id, false)];
        var pace = TrainingTrends.Of(Today, Steady(8, 5), [], checkIns, runs).EasyPace;
        pace.RecentRuns.ShouldBe(2);
        pace.EarlierRuns.ShouldBe(2);
        pace.RecentSecondsPerKm.ShouldBe(330);
        pace.EarlierSecondsPerKm.ShouldBe(360);
        pace.ChangeSecondsPerKm.ShouldBe(-30);
        pace.RecentHeartRate.ShouldBe(141);
        pace.EarlierHeartRate.ShouldBe(151);
    }

    [Fact]
    public void Pain_that_changed_a_run_eases_off_whatever_else_says_build()
    {
        List<TrendCheckIn> checkIns = [new(Today.AddDays(-4), SessionType.Easy, CheckInStatus.Done, 4, PainLevel.ChangedRunning, null, false)];
        var trends = TrainingTrends.Of(Today, Steady(6, 5), [], checkIns, []);
        trends.NextStep.ShouldBe(NextStep.EaseOff);
        trends.Reasons.ShouldBe([NextStepReason.Pain]);
    }

    [Fact]
    public void Strava_runs_count_in_the_totals_and_flag_their_seven_day_window()
    {
        var trends = TrainingTrends.Of(Today, [.. Steady(6, 5), Logged(1, 12, LoggedRunSource.Strava)], [], [], [Run(1, 12, 6, source: ActivitySource.Strava)]);
        trends.Weeks[^1].StravaKm.ShouldBe(12);
        trends.Gaps.ShouldContain(InsightGap.StravaWindow);
    }
}
