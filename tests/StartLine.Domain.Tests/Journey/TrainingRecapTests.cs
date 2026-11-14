using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Journey;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Tests.Journey;

public class TrainingRecapTests
{
    // Two weeks of training (Monday 2 November to Sunday 15 November), the race on Saturday 21 November.
    private static readonly DateOnly Start = new(2026, 11, 2);
    private static readonly DateOnly Race = new(2026, 11, 21);

    private static readonly IReadOnlyList<PlanWeek> Weeks =
    [
        Week(1, Start, Run(Start.AddDays(1), SessionType.Easy, 6), Run(Start.AddDays(2), SessionType.Strength, 0),
            Run(Start.AddDays(3), SessionType.Intervals, 8), Run(Start.AddDays(6), SessionType.LongRun, 12)),
        Week(2, Start.AddDays(7), Run(Start.AddDays(8), SessionType.Easy, 6), Run(Start.AddDays(10), SessionType.Tempo, 8),
            Run(Start.AddDays(13), SessionType.LongRun, 14)),
        Week(3, Start.AddDays(14), Run(Start.AddDays(15), SessionType.Shakeout, 3), Run(Race, SessionType.Race, 21.1)),
    ];

    private static PlannedSession Run(DateOnly date, SessionType type, double km) => new(date, type, type.ToString(), "", "", km, null);

    private static PlanWeek Week(int number, DateOnly start, params PlannedSession[] sessions) => new(number, start, TrainingPhase.Build, false, sessions);

    private static IEnumerable<PlannedSession> TrainingRuns => Weeks.SelectMany(w => w.Sessions).Where(s => s.Type is not (SessionType.Race or SessionType.Strength));

    private static RecapCheckIn Done(PlannedSession s, double? km = null, Guid? activity = null, double? prescribed = null) =>
        new(Guid.NewGuid(), s.Date, s.Type, CheckInStatus.Done, DistanceKm: km, ActivityId: activity, PrescribedKm: prescribed);

    private static TrainingRecapResult Evaluate(IEnumerable<RecapCheckIn> checkIns, DateOnly today, IEnumerable<RecapRun>? runs = null) =>
        TrainingRecap.Evaluate(Start, Race, Weeks, checkIns, runs ?? [], today);

    [Fact]
    public void Strength_and_the_race_are_not_training_runs()
    {
        var recap = Evaluate([], Start);

        recap.ScheduledRuns.ShouldBe(7);
        recap.Weeks.ShouldBe(3);
        recap.LastTrainingDate.ShouldBe(Start.AddDays(15));
    }

    [Fact]
    public void Zero_confirmed_after_the_plan_ends_is_not_all_confirmed()
    {
        var recap = Evaluate([], Race.AddDays(1));

        recap.AllConfirmed.ShouldBeFalse();
        recap.ConfirmedRuns.ShouldBe(0);
        recap.UnansweredRuns.ShouldBe(7);
        recap.TrainingEnded.ShouldBeTrue();
        recap.RaceDatePassed.ShouldBeTrue();
        recap.RecordedKm.ShouldBeNull();
        recap.LongestRecordedKm.ShouldBeNull();
        TrainingRecap.Lifecycle(recap, archived: false, null, null).ShouldBe(JourneyLifecycle.RacePending);
    }

    [Fact]
    public void Every_run_confirmed_before_race_day_is_all_confirmed_but_no_race()
    {
        var today = Race.AddDays(-1);
        var recap = Evaluate(TrainingRuns.Select(s => Done(s)), today);

        recap.AllConfirmed.ShouldBeTrue();
        recap.ConfirmedRuns.ShouldBe(7);
        recap.PlannedKmConfirmed.ShouldBe(57);
        recap.RaceDatePassed.ShouldBeFalse();
        recap.LastConfirmedDate.ShouldBe(Start.AddDays(15));
        TrainingRecap.Lifecycle(recap, archived: false, null, null).ShouldBe(JourneyLifecycle.TrainingComplete);
        TrainingRecap.Lifecycle(recap, archived: false, RaceOutcome.Finished, null).ShouldBe(JourneyLifecycle.RaceCompleted);
    }

    [Fact]
    public void Cut_short_skipped_and_swapped_runs_are_answered_but_never_confirmed()
    {
        var runs = TrainingRuns.ToList();
        var checkIns = runs.Select((s, i) => i switch
        {
            0 => new RecapCheckIn(Guid.NewGuid(), s.Date, s.Type, CheckInStatus.CutShort),
            1 => new RecapCheckIn(Guid.NewGuid(), s.Date, s.Type, CheckInStatus.Skipped),
            2 => new RecapCheckIn(Guid.NewGuid(), s.Date, s.Type, CheckInStatus.SwappedForEasy),
            _ => Done(s),
        });

        var recap = Evaluate(checkIns, Race.AddDays(-1));

        recap.ConfirmedRuns.ShouldBe(4);
        recap.CutShortRuns.ShouldBe(1);
        recap.SkippedRuns.ShouldBe(1);
        recap.SwappedRuns.ShouldBe(1);
        recap.UnansweredRuns.ShouldBe(0);
        recap.AllConfirmed.ShouldBeFalse();
        TrainingRecap.Lifecycle(recap, archived: false, null, null).ShouldBe(JourneyLifecycle.RacePending);
    }

    [Fact]
    public void A_synced_strava_run_is_never_confirmation_or_recorded_distance()
    {
        var strava = TrainingRuns.Select(s => new RecapRun(Guid.NewGuid(), s.Date, s.DistanceKm, ActivitySource.Strava)).ToList();

        var recap = Evaluate([], Race.AddDays(-1), strava);

        recap.ConfirmedRuns.ShouldBe(0);
        recap.RecordedKm.ShouldBeNull();
        recap.RecordedRuns.ShouldBe(0);
        recap.RunningDays.ShouldBe(0);
    }

    [Fact]
    public void Ticks_without_a_distance_record_nothing_and_planned_kilometres_stay_labelled_planned()
    {
        var recap = Evaluate(TrainingRuns.Take(2).Select(s => Done(s)), Start.AddDays(3));

        recap.RecordedKm.ShouldBeNull();
        recap.RecordedRuns.ShouldBe(0);
        recap.PlannedKmConfirmed.ShouldBe(14);
        recap.RunningDays.ShouldBe(2);
    }

    [Fact]
    public void The_prescription_captured_at_completion_wins_over_a_later_schedule()
    {
        var first = TrainingRuns.First();
        Evaluate([Done(first, prescribed: 9)], Start.AddDays(2)).PlannedKmConfirmed.ShouldBe(9);
    }

    [Fact]
    public void A_check_in_linked_to_an_upload_counts_once_and_its_own_distance_wins()
    {
        var easy = TrainingRuns.First();
        var upload = new RecapRun(Guid.NewGuid(), easy.Date, 6.4, ActivitySource.Upload);

        Evaluate([Done(easy, activity: upload.Id)], Start.AddDays(2), [upload]).RecordedKm.ShouldBe(6.4);
        var own = Evaluate([Done(easy, km: 6.1, activity: upload.Id)], Start.AddDays(2), [upload]);
        own.RecordedKm.ShouldBe(6.1);
        own.RecordedRuns.ShouldBe(1);
    }

    [Fact]
    public void A_ticked_run_with_a_distance_and_its_upload_the_same_day_count_once()
    {
        var easy = TrainingRuns.First();
        var upload = new RecapRun(Guid.NewGuid(), easy.Date, 6.4, ActivitySource.Upload);

        var recap = Evaluate([Done(easy, km: 6)], Start.AddDays(2), [upload]);

        recap.RecordedKm.ShouldBe(6);
        recap.RecordedRuns.ShouldBe(1);
    }

    [Fact]
    public void Several_runs_on_one_day_and_additional_runs_each_count_once()
    {
        var easy = TrainingRuns.First();
        var morning = new RecapRun(Guid.NewGuid(), easy.Date, 5, ActivitySource.Upload);
        var evening = new RecapRun(Guid.NewGuid(), easy.Date, 3, ActivitySource.Upload);
        var additional = new RecapCheckIn(Guid.NewGuid(), easy.Date, SessionType.Easy, CheckInStatus.Done, IsAdditional: true, ActivityId: evening.Id);
        var unlinkedExtra = new RecapCheckIn(Guid.NewGuid(), Start.AddDays(4), SessionType.Easy, CheckInStatus.Done, IsAdditional: true, DistanceKm: 4);

        var recap = Evaluate([Done(easy, activity: morning.Id), additional, unlinkedExtra], Start.AddDays(5), [morning, evening, morning]);

        recap.RecordedKm.ShouldBe(12);
        recap.RecordedRuns.ShouldBe(3);
        recap.ConfirmedRuns.ShouldBe(1);
        recap.LongestRecordedKm.ShouldBe(5);
        recap.LongestRecordedOn.ShouldBe(easy.Date);
        recap.RunningDays.ShouldBe(2);
    }

    [Fact]
    public void An_unknown_distance_records_nothing_and_runs_outside_the_plan_or_on_race_day_are_not_training()
    {
        var easy = TrainingRuns.First();
        var unknown = new RecapCheckIn(Guid.NewGuid(), easy.Date, easy.Type, CheckInStatus.Done, DistanceUnreported: true);
        var before = new RecapRun(Guid.NewGuid(), Start.AddDays(-1), 10, ActivitySource.Upload);
        var raceDay = new RecapRun(Guid.NewGuid(), Race, 21.2, ActivitySource.Upload);
        var other = new RecapRun(Guid.NewGuid(), easy.Date, 30, ActivitySource.Upload, ActivityKind.Other);

        var recap = Evaluate([unknown], Race.AddDays(1), [before, raceDay, other]);

        recap.RecordedKm.ShouldBeNull();
        recap.ConfirmedRuns.ShouldBe(1);
    }

    [Fact]
    public void Weeks_break_down_scheduled_confirmed_and_recorded()
    {
        var runs = TrainingRuns.ToList();
        var upload = new RecapRun(Guid.NewGuid(), runs[3].Date, 6.2, ActivitySource.Upload);

        var recap = Evaluate([Done(runs[0], km: 6.5), Done(runs[3], activity: upload.Id)], Start.AddDays(9), [upload]);

        recap.WeekBreakdown.Select(w => (w.WeekStart, w.ScheduledRuns, w.ConfirmedRuns, w.RecordedKm))
            .ShouldBe(new (DateOnly, int, int, double?)[] { (Start, 3, 1, 6.5), (Start.AddDays(7), 3, 1, 6.2), (Start.AddDays(14), 1, 0, null) });
    }

    [Fact]
    public void Runs_still_to_come_are_neither_answered_nor_unanswered()
    {
        var recap = Evaluate([Done(TrainingRuns.First())], Start.AddDays(1));

        recap.UnansweredRuns.ShouldBe(0);
        recap.TrainingEnded.ShouldBeFalse();
        TrainingRecap.Lifecycle(recap, archived: false, null, null).ShouldBe(JourneyLifecycle.Active);
    }

    [Fact]
    public void Recovery_then_the_race_result_then_the_archive_decide_the_lifecycle()
    {
        var recap = Evaluate([], Race.AddDays(2));

        TrainingRecap.Lifecycle(recap, archived: true, null, null).ShouldBe(JourneyLifecycle.Archived);
        TrainingRecap.Lifecycle(recap, archived: true, RaceOutcome.DidNotStart, null).ShouldBe(JourneyLifecycle.RaceNotCompleted);
        TrainingRecap.Lifecycle(recap, archived: false, RaceOutcome.DidNotFinish, null).ShouldBe(JourneyLifecycle.RaceNotCompleted);
        TrainingRecap.Lifecycle(recap, archived: false, RaceOutcome.Finished, RecoveryStatus.Paused).ShouldBe(JourneyLifecycle.Recovering);
        TrainingRecap.Lifecycle(recap, archived: true, RaceOutcome.Finished, RecoveryStatus.Completed).ShouldBe(JourneyLifecycle.Recovered);
    }
}
