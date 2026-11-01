using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Coaching;

public sealed class SyncedCompletionsTests
{
    private static readonly DateOnly Day = new(2026, 10, 20);
    private static readonly DateTimeOffset HeldUntil = new(2026, 10, 27, 6, 0, 0, TimeSpan.Zero);

    private static PlannedSession Session(DateOnly? date = null, SessionType type = SessionType.Easy, double km = 8, SessionSteps? steps = null) =>
        new(date ?? Day, type, type.ToString(), "", "", km, type == SessionType.Strength ? null : PaceZone.Easy, Steps: steps);

    private static TrendRun Strava(double km, double minutes = -1, DateOnly? date = null, Guid? id = null) =>
        new(id ?? Guid.NewGuid(), date ?? Day, km, TimeSpan.FromMinutes(minutes >= 0 ? minutes : km * 6), null, ActivitySource.Strava, SessionType.Easy, HeldUntil);

    private static TrendRun Upload(double km, DateOnly? date = null) =>
        new(Guid.NewGuid(), date ?? Day, km, TimeSpan.FromMinutes(km * 6), null, ActivitySource.Upload, SessionType.Easy);

    private static TrendCheckIn CheckIn(CheckInStatus status, SessionType type = SessionType.Easy, Guid? activity = null, bool additional = false) =>
        new(Day, type, status, null, null, activity, additional);

    /// <summary>Couch to 5K style: 5 min walk, 8 × (60 s run, 90 s walk), 5 min walk: 30 minutes on feet, no distance.</summary>
    private static readonly SessionSteps Intervals = new(
    [
        new SessionStep(StepKind.WarmUp, Duration: TimeSpan.FromMinutes(5)),
        new SessionStep(StepKind.Repeat, Times: 8, Block: new SessionSteps(
        [
            new SessionStep(StepKind.Run, Duration: TimeSpan.FromSeconds(60)),
            new SessionStep(StepKind.Recover, Duration: TimeSpan.FromSeconds(90)),
        ])),
        new SessionStep(StepKind.CoolDown, Duration: TimeSpan.FromMinutes(5)),
    ]);

    [Fact]
    public void A_held_strava_run_on_the_day_completes_the_one_running_session_and_says_it_was_near()
    {
        var run = Strava(8.3);
        var completion = SyncedCompletions.Of([Session()], [], [run]).ShouldHaveSingleItem();

        completion.ShouldBe(new SyncedCompletion(Day, SessionType.Easy, run.Id, SyncedCompletionState.Completed, PrescriptionMeasure.Distance,
            8, 8.3, TimeSpan.Zero, run.MovingTime, SyncedFeedback.Near, HeldUntil));
    }

    [Theory]
    [InlineData(5.2, SyncedFeedback.Shorter)]
    [InlineData(7.2, SyncedFeedback.Near)]
    [InlineData(8.8, SyncedFeedback.Near)]
    [InlineData(11, SyncedFeedback.Longer)]
    public void Shorter_and_longer_runs_still_complete_the_session_with_honest_feedback(double km, SyncedFeedback feedback)
    {
        var completion = SyncedCompletions.Of([Session()], [], [Strava(km)]).ShouldHaveSingleItem();

        completion.State.ShouldBe(SyncedCompletionState.Completed);
        completion.Feedback.ShouldBe(feedback);
        completion.ActualKm.ShouldBe(km);
    }

    [Fact]
    public void A_run_on_another_day_matches_nothing()
    {
        SyncedCompletions.Of([Session()], [], [Strava(8, date: Day.AddDays(1))]).ShouldBeEmpty();
    }

    [Fact]
    public void Rest_days_strength_days_and_race_day_are_never_completed()
    {
        // No session at all is a rest day; strength isn't a run; race day isn't checked in on.
        SyncedCompletions.Of([], [], [Strava(8)]).ShouldBeEmpty();
        SyncedCompletions.Of([Session(type: SessionType.Strength, km: 0)], [], [Strava(8)]).ShouldBeEmpty();
        SyncedCompletions.Of([Session(type: SessionType.Race, km: 10)], [], [Strava(10)]).ShouldBeEmpty();
    }

    [Fact]
    public void A_strength_session_beside_the_run_on_the_same_day_does_not_make_it_ambiguous()
    {
        var completion = SyncedCompletions.Of([Session(type: SessionType.Strength, km: 0), Session()], [], [Strava(8)]).ShouldHaveSingleItem();

        completion.SessionType.ShouldBe(SessionType.Easy);
    }

    [Theory]
    [InlineData(0.5, 3)] // a jog to the shop
    [InlineData(0, 0)] // nothing recorded at all
    [InlineData(double.NaN, 4)] // an unreadable distance and a few minutes
    public void Trivial_or_invalid_evidence_completes_nothing(double km, double minutes)
    {
        SyncedCompletions.Of([Session()], [], [Strava(km, minutes)]).ShouldBeEmpty();
    }

    [Fact]
    public void A_treadmill_run_with_no_distance_but_real_time_on_its_feet_completes_without_claiming_a_distance()
    {
        var completion = SyncedCompletions.Of([Session()], [], [Strava(0, 45)]).ShouldHaveSingleItem();

        completion.State.ShouldBe(SyncedCompletionState.Completed);
        completion.ActualKm.ShouldBe(0);
        completion.Feedback.ShouldBe(SyncedFeedback.Unmeasured);
    }

    [Fact]
    public void Thresholds_are_one_kilometre_or_ten_minutes()
    {
        SyncedCompletions.IsMeaningful(Strava(SyncedCompletions.MinKm, 4)).ShouldBeTrue();
        SyncedCompletions.IsMeaningful(Strava(0.3, SyncedCompletions.MinTime.TotalMinutes)).ShouldBeTrue();
        SyncedCompletions.IsMeaningful(Strava(0.99, 9.9)).ShouldBeFalse();
    }

    [Fact]
    public void Two_runs_in_a_day_or_two_running_sessions_in_a_day_are_ambiguous_and_complete_nothing()
    {
        SyncedCompletions.Of([Session()], [], [Strava(4), Strava(5)]).ShouldBeEmpty();
        SyncedCompletions.Of([Session(type: SessionType.Easy), Session(type: SessionType.Tempo)], [], [Strava(8)]).ShouldBeEmpty();
    }

    [Fact]
    public void A_trivial_warm_up_jog_beside_the_real_run_does_not_make_the_day_ambiguous()
    {
        var run = Strava(8);
        SyncedCompletions.Of([Session()], [], [Strava(0.6, 4), run]).ShouldHaveSingleItem().ActivityId.ShouldBe(run.Id);
    }

    [Fact]
    public void An_upload_that_day_is_the_runners_own_evidence_so_the_strava_run_adds_no_second_completion()
    {
        // The upload counts (as it always has); a held Strava copy beside it is never a second completion.
        SyncedCompletions.Of([Session()], [], [Upload(8), Strava(8)]).ShouldBeEmpty();
        SyncedCompletions.Of([Session()], [], [Upload(8)]).ShouldBeEmpty();
    }

    [Fact]
    public void The_same_run_seen_twice_after_repeated_syncs_is_one_run()
    {
        var id = Guid.NewGuid();
        var completions = SyncedCompletions.Of([Session()], [], [Strava(8, id: id), Strava(8, id: id)]);

        completions.ShouldHaveSingleItem().ActivityId.ShouldBe(id);
        SyncedCompletions.Of([Session()], [], [Strava(8, id: id)]).ShouldBe(completions);
    }

    [Theory]
    [InlineData(CheckInStatus.Done)]
    [InlineData(CheckInStatus.CutShort)]
    [InlineData(CheckInStatus.SwappedForEasy)]
    public void A_runners_own_check_in_wins_and_nothing_is_computed_over_it(CheckInStatus status)
    {
        SyncedCompletions.Of([Session()], [CheckIn(status)], [Strava(5)]).ShouldBeEmpty();
    }

    [Fact]
    public void A_runner_who_said_they_skipped_it_keeps_their_word_and_the_run_is_shown_as_a_conflict()
    {
        var completion = SyncedCompletions.Of([Session()], [CheckIn(CheckInStatus.Skipped)], [Strava(8)]).ShouldHaveSingleItem();

        completion.State.ShouldBe(SyncedCompletionState.Conflict);
    }

    [Fact]
    public void A_run_the_runner_logged_as_an_extra_run_or_linked_elsewhere_is_theirs_and_is_not_matched_again()
    {
        var run = Strava(8);
        SyncedCompletions.Of([Session()], [CheckIn(CheckInStatus.Done, activity: run.Id, additional: true)], [run]).ShouldBeEmpty();
    }

    [Fact]
    public void Matching_is_by_the_runners_local_day_the_run_was_recorded_on()
    {
        // Late on the 20th in the runner's zone is the 21st in some places and the 20th in UTC: the run's local day decides.
        List<PlannedSession> sessions = [Session(Day, SessionType.Easy), Session(Day.AddDays(1), SessionType.Tempo)];

        SyncedCompletions.Of(sessions, [], [Strava(8, date: Day.AddDays(1))]).ShouldHaveSingleItem().SessionType.ShouldBe(SessionType.Tempo);
    }

    [Fact]
    public void A_time_based_session_is_judged_by_time_on_feet_not_distance()
    {
        var session = Session(km: 0, steps: Intervals);
        SessionPrescription.Of(session).ShouldBe(new SessionPrescription(PrescriptionMeasure.Duration, 0, TimeSpan.FromMinutes(30)));

        // 3.2 km says nothing about a run/walk session; 31 minutes against 30 is near, 22 is shorter, 40 longer.
        SyncedCompletions.Of([session], [], [Strava(3.2, 31)]).ShouldHaveSingleItem().Feedback.ShouldBe(SyncedFeedback.Near);
        SyncedCompletions.Of([session], [], [Strava(2.1, 22)]).ShouldHaveSingleItem().Feedback.ShouldBe(SyncedFeedback.Shorter);
        var longer = SyncedCompletions.Of([session], [], [Strava(4.5, 40)]).ShouldHaveSingleItem();
        longer.Feedback.ShouldBe(SyncedFeedback.Longer);
        longer.Measure.ShouldBe(PrescriptionMeasure.Duration);
        longer.PlannedTime.ShouldBe(TimeSpan.FromMinutes(30));
        longer.ActualTime.ShouldBe(TimeSpan.FromMinutes(40));
    }

    [Fact]
    public void A_session_with_any_step_measured_by_distance_is_judged_by_distance()
    {
        var steps = new SessionSteps([new SessionStep(StepKind.WarmUp, DistanceKm: 2), new SessionStep(StepKind.Run, Duration: TimeSpan.FromMinutes(20))]);

        SessionPrescription.Of(Session(km: 6, steps: steps)).Measure.ShouldBe(PrescriptionMeasure.Distance);
    }

    [Fact]
    public void Adherence_counts_a_held_strava_completion_once_and_never_beside_an_upload_of_the_same_day()
    {
        var today = Day.AddDays(3);
        List<PlannedSession> sessions = [Session(Day), Session(Day.AddDays(1)), Session(Day.AddDays(2))];
        List<TrendRun> runs = [Strava(8), Upload(8, Day.AddDays(1)), Strava(8, date: Day.AddDays(1))];

        TrainingTrends.AdherenceOf(today, sessions, [], runs).ShouldBe(new SessionAdherence(3, 2, 0, 1, 0.67));
    }
}
