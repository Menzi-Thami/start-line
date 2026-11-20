using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>
/// The exact changes the AI coach can only ever propose through: shorter and slower are allowed, longer a little on steady runs,
/// faster never; hard sessions keep their structure; past, done, strength and race days never change.
/// </summary>
public sealed class SessionAdjusterTests
{
    // Week 1 (build, from Monday 2 November): Mon easy 6, Tue intervals 9, Thu easy 7, Sat recovery 5, Sun long 16 = 43 km.
    // Week 2 (peak): Mon easy 6, Sun long 20. Week 3 (taper): Mon easy 6, Sun long 10.
    private static readonly DateOnly Monday = new(2026, 11, 2);

    private static readonly Dictionary<PaceZone, PaceRange> Paces = new()
    {
        [PaceZone.Recovery] = Range(370, 400),
        [PaceZone.Easy] = Range(330, 360),
        [PaceZone.LongRun] = Range(340, 370),
        [PaceZone.Tempo] = Range(285, 295),
        [PaceZone.Interval] = Range(255, 265),
        [PaceZone.Race] = Range(300, 305),
    };

    private static PaceRange Range(double fast, double slow) => new(Pace.FromSecondsPerKilometre(fast), Pace.FromSecondsPerKilometre(slow));

    private static PlannedSession Run(int day, SessionType type, double km, RunWalkRatio? runWalk = null) =>
        new(Monday.AddDays(day), type, type.ToString(), "", "", km, SessionAdjuster.IsSteady(type) ? SessionAdjuster.ZoneOf(type) : PaceZone.Interval, RunWalk: runWalk);

    private static TrainingPlan Plan(RunWalkRatio? runWalk = null) => new(Distance.FromKilometres(21.0975), DistanceCategory.HalfMarathon, Monday.AddDays(27), TimeSpan.FromHours(1.9),
        Monday, Paces,
        [
            new PlanWeek(1, Monday, TrainingPhase.Build, false,
                [Run(0, SessionType.Easy, 6), Run(1, SessionType.Intervals, 9), Run(3, SessionType.Easy, 7), Run(5, SessionType.Recovery, 5), Run(6, SessionType.LongRun, 16, runWalk)]),
            new PlanWeek(2, Monday.AddDays(7), TrainingPhase.Peak, false, [Run(7, SessionType.Easy, 6), Run(13, SessionType.LongRun, 20)]),
            new PlanWeek(3, Monday.AddDays(14), TrainingPhase.Taper, false, [Run(14, SessionType.Easy, 6), Run(20, SessionType.LongRun, 10)]),
        ],
        []);

    private static SessionAdjustmentProposal Ask(SessionAdjustmentRequest request, DateOnly? today = null, IReadOnlyList<SessionCheckIn>? checkIns = null, TrainingPlan? plan = null, TrainingPlan? asWritten = null) =>
        SessionAdjuster.Propose(plan ?? Plan(), today ?? Monday, request, checkIns ?? [], asWritten);

    private static SessionAdjustmentRequest Km(int day, double km) => new(Monday.AddDays(day), AdjustmentKind.Distance, Km: km);

    private static SessionAdjustmentRequest Minutes(int day, int minutes) => new(Monday.AddDays(day), AdjustmentKind.Duration, Minutes: minutes);

    private static SessionAdjustmentRequest PaceOf(int day, int seconds) => new(Monday.AddDays(day), AdjustmentKind.Pace, PaceSecondsPerKm: seconds);

    [Fact]
    public void A_shorter_easy_run_stays_an_easy_run_at_the_same_pace()
    {
        var result = Ask(Km(3, 5));
        result.Outcome.ShouldBe(AdjustmentOutcome.Proposed);
        result.After!.Type.ShouldBe(SessionType.Easy);
        result.After.DistanceKm.ShouldBe(5);
        result.Change!.Type.ShouldBe(SessionType.Easy);
        result.Change.EasyFastestSecondsPerKm.ShouldBe(330);
        result.Change.EasySlowestSecondsPerKm.ShouldBe(360);
        result.WeekKmBefore.ShouldBe(43);
        result.WeekKmAfter.ShouldBe(41);
    }

    [Fact]
    public void A_shorter_long_run_stays_a_long_run_and_keeps_its_run_walk()
    {
        var ratio = new RunWalkRatio(240, 60);
        var result = Ask(Km(6, 12), plan: Plan(ratio));
        result.After!.Type.ShouldBe(SessionType.LongRun);
        result.After.DistanceKm.ShouldBe(12);
        result.After.RunWalk.ShouldNotBeNull();
    }

    [Fact]
    public void A_hard_session_squeezed_shorter_becomes_an_easy_run_and_is_never_lengthened()
    {
        var shorter = Ask(Km(1, 6));
        shorter.Outcome.ShouldBe(AdjustmentOutcome.Proposed);
        shorter.After!.Type.ShouldBe(SessionType.Easy);
        shorter.Change!.Type.ShouldBeNull();
        shorter.Reason.ShouldContain("isn't squeezed");

        Ask(Km(1, 11)).Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
    }

    [Fact]
    public void A_steady_run_grows_a_little_but_never_past_its_own_limit()
    {
        var grown = Ask(Km(3, 8));
        grown.Outcome.ShouldBe(AdjustmentOutcome.Proposed);
        grown.After!.DistanceKm.ShouldBe(8);
        grown.WeekKmAfter.ShouldBe(44);

        // 7 km grows by at most 20%: 8.4, rounded down to a quarter.
        var tooMuch = Ask(Km(3, 10));
        tooMuch.Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        tooMuch.SafeLimitKm.ShouldBe(8.25);
        tooMuch.Change.ShouldBeNull();
    }

    [Fact]
    public void The_week_never_grows_more_than_ten_percent()
    {
        // 2 km easy and a 16 km long run: the week may reach 19.8 km, so the long run 17.75 km at most, though 20% would be 19.2.
        var small = new TrainingPlan(Distance.FromKilometres(21.0975), DistanceCategory.HalfMarathon, Monday.AddDays(27), TimeSpan.FromHours(1.9), Monday, Paces,
            [new PlanWeek(1, Monday, TrainingPhase.Build, false, [Run(0, SessionType.Easy, 2), Run(6, SessionType.LongRun, 16)]),
             new PlanWeek(2, Monday.AddDays(7), TrainingPhase.Peak, false, [Run(13, SessionType.LongRun, 20)])], []);
        var result = Ask(Km(6, 19), plan: small);
        result.Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        result.SafeLimitKm.ShouldBe(17.75);
        Ask(Km(6, 17.75), plan: small).Outcome.ShouldBe(AdjustmentOutcome.Proposed);
    }

    [Fact]
    public void Growth_is_measured_from_the_plan_as_written_so_changes_cannot_compound()
    {
        var written = Plan();
        var first = Ask(Km(3, 8.25)).Change!;
        var adjusted = RemainingWeek.Apply(written, [first]);
        // Already at its limit: asking again from the changed plan can't add another 20%.
        Ask(Km(3, 9.5), plan: adjusted, asWritten: written).Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        Ask(Km(3, 9.5), plan: adjusted).Outcome.ShouldBe(AdjustmentOutcome.Proposed, "without the plan as written, growth would compound");
    }

    [Fact]
    public void Nothing_grows_in_the_taper_or_after_pain_but_shortening_is_still_fine()
    {
        var taper = Ask(Km(14, 7), today: Monday.AddDays(14));
        taper.Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        taper.Reason.ShouldContain("tapering");

        var niggle = SessionCheckIn.Create(Guid.NewGuid(), Monday.AddDays(-3), SessionType.Easy, new CheckInAnswers(CheckInStatus.Done, 4, PainLevel.Niggle, BodyArea.Calf));
        var sore = Ask(Km(3, 8), checkIns: [niggle]);
        sore.Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        sore.Reason.ShouldContain("niggle");
        Ask(Km(3, 5), checkIns: [niggle]).Outcome.ShouldBe(AdjustmentOutcome.Proposed);

        // Pain from more than two weeks ago no longer holds a run back.
        var old = SessionCheckIn.Create(Guid.NewGuid(), Monday.AddDays(-SessionAdjuster.PainLookbackDays - 1), SessionType.Easy, new CheckInAnswers(CheckInStatus.Done, 4, PainLevel.ChangedRunning, BodyArea.Knee));
        Ask(Km(3, 8), checkIns: [old]).Outcome.ShouldBe(AdjustmentOutcome.Proposed);
    }

    [Fact]
    public void A_recovery_run_never_grows_past_its_cap_and_no_run_outgrows_the_long_run()
    {
        Ask(Km(5, 6)).Outcome.ShouldBe(AdjustmentOutcome.Proposed);
        Ask(Km(5, 6.5)).Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        SessionAdjuster.RecoveryCapKm.ShouldBe(8);
    }

    [Fact]
    public void Time_short_runs_shrink_to_fit_at_the_slow_end_of_their_pace()
    {
        // 7 km at 6:00/km needs 42 minutes.
        Ask(Minutes(3, 45)).Outcome.ShouldBe(AdjustmentOutcome.NoChangeNeeded);
        var fits = Ask(Minutes(3, 30));
        fits.After!.Type.ShouldBe(SessionType.Easy);
        fits.After.DistanceKm.ShouldBe(5);

        // Intervals in 40 minutes become an easy 6.5 km, never a squeezed hard session.
        var squeezed = Ask(Minutes(1, 40));
        squeezed.After!.Type.ShouldBe(SessionType.Easy);
        squeezed.After.DistanceKm.ShouldBe(6.5);
        squeezed.Change!.Type.ShouldBeNull();
    }

    [Fact]
    public void A_run_too_short_to_be_useful_becomes_a_rest_day()
    {
        var slow = Paces.ToDictionary(p => p.Key, p => p.Value);
        slow[PaceZone.Easy] = Range(600, 720);
        var plan = Plan() with { Paces = slow };
        var result = Ask(Minutes(3, 10), plan: plan);
        result.Outcome.ShouldBe(AdjustmentOutcome.Proposed);
        result.After.ShouldBeNull();
        result.Change!.EasyKm.ShouldBeNull();
        result.WeekKmAfter.ShouldBe(36);
    }

    [Fact]
    public void Slower_paces_are_allowed_faster_ones_never_and_hard_sessions_keep_theirs()
    {
        var slower = Ask(PaceOf(3, 380));
        slower.Outcome.ShouldBe(AdjustmentOutcome.Proposed);
        slower.Change!.EasyFastestSecondsPerKm.ShouldBe(370);
        slower.Change.EasySlowestSecondsPerKm.ShouldBe(390);
        slower.After!.DistanceKm.ShouldBe(7);

        Ask(PaceOf(3, 345)).Outcome.ShouldBe(AdjustmentOutcome.NoChangeNeeded);
        var faster = Ask(PaceOf(3, 300));
        faster.Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        faster.Reason.ShouldContain("weekly coach");
        Ask(PaceOf(3, 460)).Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
        Ask(PaceOf(1, 280)).Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);

        // A long run's pace is its long-run zone.
        var longRun = Ask(PaceOf(6, 380));
        longRun.After!.Type.ShouldBe(SessionType.LongRun);
        longRun.Change!.EasySlowestSecondsPerKm.ShouldBe(390);
    }

    [Fact]
    public void Past_done_race_strength_and_far_off_days_never_change()
    {
        Should.Throw<DomainException>(() => Ask(Km(0, 5), today: Monday.AddDays(1)));
        Should.Throw<DomainException>(() => Ask(Km(14, 5)));
        Should.Throw<DomainException>(() => Ask(Km(2, 5)));
        var done = SessionCheckIn.Create(Guid.NewGuid(), Monday.AddDays(3), SessionType.Easy, new CheckInAnswers(CheckInStatus.Done, 3));
        Should.Throw<DomainException>(() => Ask(Km(3, 5), today: Monday.AddDays(3), checkIns: [done]));

        var raceWeek = new TrainingPlan(Distance.FromKilometres(10), DistanceCategory.TenK, Monday.AddDays(6), TimeSpan.FromMinutes(50), Monday, Paces,
            [new PlanWeek(1, Monday, TrainingPhase.RaceWeek, false, [Run(1, SessionType.Easy, 5), new(Monday.AddDays(6), SessionType.Race, "Race day", "", "", 10, PaceZone.Race)])], []);
        Should.Throw<DomainException>(() => Ask(Km(6, 8), plan: raceWeek));
        Ask(Km(1, 6), plan: raceWeek).Outcome.ShouldBe(AdjustmentOutcome.NotRecommended);
    }

    [Theory]
    [InlineData(AdjustmentKind.Distance, null, 0.5, null)]
    [InlineData(AdjustmentKind.Distance, null, 150.0, null)]
    [InlineData(AdjustmentKind.Duration, 5, null, null)]
    [InlineData(AdjustmentKind.Duration, 301, null, null)]
    [InlineData(AdjustmentKind.Pace, null, null, 100)]
    [InlineData(AdjustmentKind.Pace, null, null, 1000)]
    [InlineData(AdjustmentKind.Distance, 30, null, 300)]
    public void Out_of_range_or_missing_values_are_refused(AdjustmentKind kind, int? minutes, double? km, int? pace) =>
        Should.Throw<DomainException>(() => Ask(new SessionAdjustmentRequest(Monday.AddDays(3), kind, minutes, km, pace)));

    [Fact]
    public void Saving_checks_the_change_once_more_and_restoring_puts_the_day_back()
    {
        var saved = SavedPlan.Create(Guid.NewGuid(), "Half", new SavedPlanInputs(null, "Half", 21.1, Monday.AddDays(27), TimeSpan.FromHours(1.9),
            [DayOfWeek.Monday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 40, Experience.Regular, [], Monday));
        var change = Ask(Km(3, 8)).Change!;
        saved.ApplySessionAdjustment(change, Monday);
        saved.Adjustments.ShouldHaveSingleItem().EasyKm.ShouldBe(8);

        Should.Throw<DomainException>(() => saved.ApplySessionAdjustment(change with { EasyKm = 9 }, Monday));
        Should.Throw<DomainException>(() => saved.ApplySessionAdjustment(change with { Type = null, EasyKm = 7.5 }, Monday));
        Should.Throw<DomainException>(() => saved.ApplySessionAdjustment(change with { MovedFrom = Monday }, Monday));
        Should.Throw<DomainException>(() => saved.ApplySessionAdjustment(change with { AppliedOn = Monday.AddDays(-1) }, Monday));
        Should.Throw<DomainException>(() => saved.ApplySessionAdjustment(change with { OriginalType = SessionType.Race }, Monday));
        Should.Throw<DomainException>(() => saved.ApplySessionAdjustment(change with { EasyFastestSecondsPerKm = double.NaN }, Monday));

        saved.RestoreOriginal([Monday.AddDays(3)], Monday);
        saved.Adjustments.ShouldBeEmpty();
    }

    [Fact]
    public void Changes_saved_before_kept_types_still_become_easy_runs()
    {
        var old = new SessionRevision(Monday, Monday.AddDays(6), SessionType.LongRun, "Long run", 16, 10, 330, 360);
        var session = RemainingWeek.Apply(Plan(), [old]).Weeks[0].Sessions.Single(s => s.Date == Monday.AddDays(6));
        session.Type.ShouldBe(SessionType.Easy);
        session.DistanceKm.ShouldBe(10);
    }
}
