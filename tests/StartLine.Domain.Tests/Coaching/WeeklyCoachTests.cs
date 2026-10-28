using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Coaching;

/// <summary>The weekly coach's rules, one test each.</summary>
public sealed class WeeklyCoachTests
{
    private static readonly DateOnly Monday = new(2026, 11, 2);

    // Last week: a tempo, an easy run, intervals, an easy run and a long run (42 km in all).
    private static readonly PlannedSession[] LastWeek =
    [
        Run(1, SessionType.Tempo, 9, PaceZone.Tempo),
        Run(2, SessionType.Easy, 6, PaceZone.Easy),
        Run(3, SessionType.Intervals, 9, PaceZone.Interval),
        Run(5, SessionType.Easy, 6, PaceZone.Easy),
        Run(6, SessionType.LongRun, 12, PaceZone.LongRun),
    ];

    private static PlannedSession Run(int day, SessionType type, double km, PaceZone zone) =>
        new(Monday.AddDays(day - 7), type, type.ToString(), "", "", km, zone);

    /// <summary>Every run checked in as done, at the middle of how it should feel, unless <paramref name="change"/> says otherwise.</summary>
    private static List<RunEvidence> Week(Func<PlannedSession, RunEvidence?>? change = null) =>
        [.. LastWeek.Select(s => change?.Invoke(s) ?? new RunEvidence(s, new CheckInAnswers(CheckInStatus.Done, Typical(s.Type))))];

    private static int Typical(SessionType type) => ExpectedEffort.For(type) is { } e ? (e.Low + e.High) / 2 : 5;

    private static RunEvidence Felt(PlannedSession s, int effort, PainLevel pain = PainLevel.None) =>
        new(s, new CheckInAnswers(CheckInStatus.Done, effort, pain, pain == PainLevel.None ? null : BodyArea.Calf));

    private static CoachDecision Decide(List<RunEvidence> week, CoachDecision? previous = null) => WeeklyCoach.Decide(Monday, week, previous);

    [Fact]
    public void Coach_runs_the_plan_as_written_when_the_week_went_to_plan()
    {
        var call = Decide(Week());

        call.Verdict.ShouldBe(CoachVerdict.OnTrack);
        call.ChangesThePlan.ShouldBeFalse();
    }

    [Fact]
    public void Coach_needs_check_ins_or_recorded_runs_on_half_the_runs_to_judge_a_week()
    {
        var call = Decide([.. LastWeek.Take(2).Select(s => Felt(s, 10)), .. LastWeek.Skip(2).Select(s => new RunEvidence(s, null))]);

        call.Verdict.ShouldBe(CoachVerdict.NotEnoughToGoOn);
        call.ChangesThePlan.ShouldBeFalse();
    }

    [Fact]
    public void Coach_judges_a_week_from_recorded_runs_alone()
    {
        var call = Decide(Week(s => new RunEvidence(s, null, RecordedKm: s.DistanceKm)));

        call.Verdict.ShouldBe(CoachVerdict.OnTrack);
    }

    [Fact]
    public void Coach_eases_off_after_two_runs_felt_harder_than_they_should()
    {
        // Easy runs should feel 2–4: a 6 is two above the top.
        var call = Decide(Week(s => s.Type == SessionType.Easy ? Felt(s, 6) : null));

        call.Verdict.ShouldBe(CoachVerdict.Struggling);
        call.HoldVolume.ShouldBeTrue();
        call.DoseStep.ShouldBe(-1);
        call.Reasons.ShouldContain(CoachReason.FeltHarderThanPlanned);
    }

    [Fact]
    public void Coach_lets_one_hard_run_go()
    {
        var call = Decide(Week(s => s.Type == SessionType.Tempo ? Felt(s, 10) : null));

        call.Verdict.ShouldBe(CoachVerdict.OnTrack);
    }

    [Fact]
    public void Coach_holds_volume_after_a_week_under_70_percent()
    {
        var call = Decide(Week(s => s.Type == SessionType.LongRun ? new RunEvidence(s, new CheckInAnswers(CheckInStatus.Skipped, null)) : null));

        // 30 of 42 km is 71%: not yet. Skipping the intervals as well takes it to 50%.
        call.Verdict.ShouldBe(CoachVerdict.OnTrack);
        var missed = Decide(Week(s => s.Type is SessionType.LongRun or SessionType.Intervals ? new RunEvidence(s, new CheckInAnswers(CheckInStatus.Skipped, null)) : null));
        missed.Verdict.ShouldBe(CoachVerdict.Struggling);
        missed.Reasons.ShouldContain(CoachReason.MissedVolume);
    }

    [Fact]
    public void Coach_counts_a_cut_short_run_as_half_its_distance_unless_told()
    {
        // Three of five runs cut short: half of their 30 km counts, so 27 of 42 km (64%) is a missed week.
        var cutShort = Decide(Week(s => s.Type is SessionType.LongRun or SessionType.Tempo or SessionType.Intervals ? new RunEvidence(s, new CheckInAnswers(CheckInStatus.CutShort, 6)) : null));
        cutShort.Reasons.ShouldContain(CoachReason.MissedVolume);

        var told = Decide(Week(s => s.Type is SessionType.LongRun or SessionType.Tempo or SessionType.Intervals
            ? new RunEvidence(s, new CheckInAnswers(CheckInStatus.CutShort, 6, DistanceKm: s.DistanceKm - 1))
            : null));
        told.Reasons.ShouldNotContain(CoachReason.MissedVolume);
    }

    [Fact]
    public void Coach_eases_off_when_heart_rate_drifts_on_two_easy_runs()
    {
        var call = Decide(Week(s => s.Type == SessionType.Easy ? new RunEvidence(s, null, s.DistanceKm, HeartRateDriftPercent: 7) : null));

        call.Verdict.ShouldBe(CoachVerdict.Struggling);
        call.Reasons.ShouldContain(CoachReason.HighHeartRateDrift);
    }

    [Fact]
    public void Coach_eases_off_after_two_niggles()
    {
        var call = Decide(Week(s => s.Type is SessionType.Easy ? Felt(s, 3, PainLevel.Niggle) : null));

        call.Verdict.ShouldBe(CoachVerdict.Struggling);
        call.Reasons.ShouldContain(CoachReason.Niggles);
    }

    [Fact]
    public void Coach_eases_off_for_pain_and_leaves_the_replan_to_the_runner()
    {
        var call = Decide(Week(s => s.Type == SessionType.LongRun ? Felt(s, 5, PainLevel.ChangedRunning) : null));

        call.Verdict.ShouldBe(CoachVerdict.Hurting);
        call.HoldVolume.ShouldBeTrue();
        call.DoseStep.ShouldBe(-1);
        call.CutbackNow.ShouldBeFalse();
    }

    [Fact]
    public void Coach_brings_the_easier_week_forward_after_two_hard_weeks()
    {
        var first = Decide(Week(s => s.Type == SessionType.Easy ? Felt(s, 7) : null));
        var second = Decide(Week(s => s.Type == SessionType.Easy ? Felt(s, 7) : null), first);

        first.CutbackNow.ShouldBeFalse();
        second.CutbackNow.ShouldBeTrue();
        second.Reasons.ShouldContain(CoachReason.StrugglingTwice);
    }

    [Fact]
    public void Coach_notes_a_strong_week_but_steps_up_only_after_two()
    {
        // Tempo should feel 6–7 and intervals 7–8: a 4 and a 5 are two below the bottom.
        RunEvidence? Strong(PlannedSession s) => s.Type switch
        {
            SessionType.Tempo => Felt(s, 4),
            SessionType.Intervals => Felt(s, 5),
            _ => null,
        };

        var first = Decide(Week(Strong));
        var second = Decide(Week(Strong), first);

        first.Verdict.ShouldBe(CoachVerdict.Thriving);
        first.DoseStep.ShouldBe(0);
        second.DoseStep.ShouldBe(1);
        second.Reasons.ShouldContain(CoachReason.ThrivingTwice);
        second.HoldVolume.ShouldBeFalse();
    }

    [Fact]
    public void Coach_counts_hard_sessions_run_faster_than_planned_as_a_strong_week()
    {
        var call = Decide(Week(s => ExpectedEffort.IsHard(s.Type) ? new RunEvidence(s, null, s.DistanceKm, PaceVerdict.Faster) : null));

        call.Verdict.ShouldBe(CoachVerdict.Thriving);
        call.Reasons.ShouldContain(CoachReason.FasterThanPlanned);
    }

    [Fact]
    public void Coach_never_calls_a_short_week_strong()
    {
        var call = Decide(Week(s => s.Type switch
        {
            SessionType.Tempo => Felt(s, 4),
            SessionType.Intervals => Felt(s, 5),
            SessionType.Easy => new RunEvidence(s, new CheckInAnswers(CheckInStatus.Skipped, null)),
            _ => null,
        }));

        call.Verdict.ShouldNotBe(CoachVerdict.Thriving);
    }
    [Fact]
    public void Easy_replacements_never_count_as_easier_hard_work_or_speed_up_paces()
    {
        var evidence = Week(s => new RunEvidence(s, new CheckInAnswers(CheckInStatus.Done, 3, DistanceKm: s.DistanceKm, ActualSessionType: SessionType.Easy)));
        Decide(evidence).Verdict.ShouldBe(CoachVerdict.OnTrack);
        Fitness.PaceFactor(1, evidence).ShouldBe(1);
        var legacy = Week(s => new RunEvidence(s, new CheckInAnswers(CheckInStatus.SwappedForEasy, 3)));
        Decide(legacy).Verdict.ShouldBe(CoachVerdict.OnTrack);
        Fitness.PaceFactor(1, legacy).ShouldBe(1);
    }

    [Fact]
    public void Unknown_kilometres_are_not_treated_as_missed_volume()
    {
        var evidence = Week(s => new RunEvidence(s, new CheckInAnswers(CheckInStatus.Done, 4,
            Duration: TimeSpan.FromMinutes(40), DistanceUnreported: true)));
        Decide(evidence).Reasons.ShouldNotContain(CoachReason.MissedVolume);
    }

}
