using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;
using StartLine.Domain.Tests.Activities;

namespace StartLine.Domain.Tests.Coaching;

/// <summary>
/// What Taperday keeps for good (the coach's calls and the running totals) comes only from check-ins and uploads: a run
/// synced from Strava is a 7-day cache, and nothing derived from it may outlast it (Strava API Policy 5.3, 5.4, 5.5, 6.2).
/// </summary>
public sealed class KeptDataTests
{
    private static readonly DateOnly Day = DateOnly.FromDateTime(RunBuilder.Start.UtcDateTime);

    private static readonly PlannedSession Tempo = new(Day, SessionType.Tempo, "Tempo", "", "", 10, PaceZone.Tempo);

    private static readonly PlannedSessionMatch TempoMatch = new("Plan", SessionType.Tempo, "Tempo", 10, 240, 250, PaceZone.Tempo);

    /// <summary>A 12 km run on <see cref="Day"/>, matched to the tempo, from <paramref name="origin"/>.</summary>
    private static Activity Run(ActivityOrigin origin, double metres = 12_000, DateOnly? on = null) =>
        Activity.Record(Guid.NewGuid(), new RunBuilder().Run(metres, 250).Build(), on ?? Day, [TempoMatch], origin);

    private static ActivityOrigin Strava => ActivityOrigin.Strava(42, RunBuilder.Start, recordedOnGarmin: false);

    [Fact]
    public void The_coach_counts_an_uploaded_run_as_evidence()
    {
        var evidence = CoachEvidence.ForWeek([Tempo], [], [Run(ActivityOrigin.Upload)]).ShouldHaveSingleItem();

        evidence.IsKnown.ShouldBeTrue();
        evidence.RecordedKm!.Value.ShouldBe(12, tolerance: 0.01);
    }

    [Fact]
    public void The_coach_never_counts_a_synced_strava_run()
    {
        var evidence = CoachEvidence.ForWeek([Tempo], [], [Run(Strava)]).ShouldHaveSingleItem();

        evidence.IsKnown.ShouldBeFalse();
        evidence.RecordedKm.ShouldBeNull();
        evidence.Pace.ShouldBeNull();
        evidence.HeartRateDriftPercent.ShouldBeNull();
    }

    [Fact]
    public void A_strava_run_changes_nothing_about_the_coachs_call()
    {
        // The same week, with and without a synced run beside the runner's own check-in: the same call.
        var tick = SessionCheckIn.Create(Guid.NewGuid(), Day, SessionType.Tempo, new CheckInAnswers(CheckInStatus.Done, null));
        var monday = Day.AddDays(7 - ((int)Day.DayOfWeek + 6) % 7);

        var without = WeeklyCoach.Decide(monday, CoachEvidence.ForWeek([Tempo], [tick], []), null);
        var with = WeeklyCoach.Decide(monday, CoachEvidence.ForWeek([Tempo], [tick], [Run(Strava, metres: 4_000)]), null);

        with.ShouldBeEquivalentTo(without);
    }

    [Fact]
    public void A_tick_alone_tells_the_coach_the_run_happened()
    {
        var tick = SessionCheckIn.Create(Guid.NewGuid(), Day, SessionType.Tempo, new CheckInAnswers(CheckInStatus.Done, null));

        CoachEvidence.ForWeek([Tempo], [tick], []).ShouldHaveSingleItem().IsKnown.ShouldBeTrue();
    }

    [Fact]
    public void Fitness_is_estimated_from_uploaded_runs_only()
    {
        CoachEvidence.Efforts([Run(Strava)]).ShouldBeEmpty();
        CoachEvidence.Efforts([Run(ActivityOrigin.Upload)]).ShouldNotBeEmpty();
    }

    private static TickedSession Ticked(DateOnly date, CheckInStatus status = CheckInStatus.Done, double plannedKm = 10, double? gaveKm = null) =>
        new(date, plannedKm, new CheckInAnswers(status, status is CheckInStatus.Done or CheckInStatus.Skipped ? null : 5, DistanceKm: gaveKm));

    [Fact]
    public void A_ticked_session_counts_at_its_planned_distance()
    {
        var run = RunningLog.Of([Ticked(Day)], []).ShouldHaveSingleItem();

        run.ShouldBe(new LoggedRun(Day, 10, LoggedRunSource.Ticked));
    }

    [Fact]
    public void An_uploaded_run_counts_at_the_distance_it_measured()
    {
        var run = RunningLog.Of([], [Run(ActivityOrigin.Upload)]).ShouldHaveSingleItem();

        run.Source.ShouldBe(LoggedRunSource.Uploaded);
        run.DistanceKm.ShouldBe(12, tolerance: 0.01);
    }

    [Fact]
    public void A_day_ticked_and_uploaded_counts_once_at_the_uploads_distance()
    {
        var log = RunningLog.Of([Ticked(Day)], [Run(ActivityOrigin.Upload)]);

        log.ShouldHaveSingleItem().Source.ShouldBe(LoggedRunSource.Uploaded);
        log.Sum(r => r.DistanceKm).ShouldBe(12, tolerance: 0.01);
    }

    [Fact]
    public void A_synced_strava_run_never_counts_or_displaces_a_tick()
    {
        RunningLog.Of([], [Run(Strava)]).ShouldBeEmpty();

        var log = RunningLog.Of([Ticked(Day)], [Run(Strava)]);

        log.ShouldHaveSingleItem().ShouldBe(new LoggedRun(Day, 10, LoggedRunSource.Ticked));
    }

    [Fact]
    public void A_skipped_run_is_not_running_and_a_cut_short_one_counts_half_unless_a_distance_was_given()
    {
        var log = RunningLog.Of(
            [Ticked(Day.AddDays(-3), CheckInStatus.Skipped), Ticked(Day.AddDays(-2), CheckInStatus.CutShort), Ticked(Day.AddDays(-1), CheckInStatus.CutShort, gaveKm: 7.5)],
            []);

        log.Select(r => r.DistanceKm).ShouldBe([5, 7.5]);
    }

    [Fact]
    public void Ticks_and_uploads_on_different_days_both_count_oldest_first()
    {
        var log = RunningLog.Of([Ticked(Day)], [Run(ActivityOrigin.Upload, on: Day.AddDays(-1))]);

        log.Select(r => r.Source).ShouldBe([LoggedRunSource.Uploaded, LoggedRunSource.Ticked]);
    }
}
