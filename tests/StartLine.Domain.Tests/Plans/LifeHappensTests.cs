using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

public sealed class LifeHappensTests
{
    // Monday 2 November: Mon easy, Tue intervals, Wed rest, Thu easy, Fri rest, Sat rest, Sun long run.
    private static readonly DateOnly Monday = new(2026, 11, 2);

    private static PlannedSession Run(int day, SessionType type, double km) => new(Monday.AddDays(day), type, type.ToString(), "", "", km, PaceZone.Easy);

    private static TrainingPlan Plan() => new(Distance.FromKilometres(21.0975), DistanceCategory.HalfMarathon, new DateOnly(2026, 12, 20), TimeSpan.FromHours(1.9),
        Monday,
        new Dictionary<PaceZone, PaceRange> { [PaceZone.Easy] = new(Pace.FromSecondsPerKilometre(330), Pace.FromSecondsPerKilometre(360)) },
        [new PlanWeek(1, Monday, TrainingPhase.Base, false, [Run(0, SessionType.Easy, 6), Run(1, SessionType.Intervals, 9), Run(3, SessionType.Easy, 7), Run(6, SessionType.LongRun, 16)])],
        []);

    [Fact]
    public void Any_run_this_week_moves_to_any_free_day_this_week_even_next_to_a_hard_one()
    {
        var today = Monday;
        // Tuesday's intervals: Wed, Fri and Sat are free, and Wed is next to nothing hard once Tuesday moves.
        var offered = LifeHappens.Propose(Plan(), today, new(LifeSituation.MoveRun, Date: Monday.AddDays(1)), []);
        offered.MoveTargets.ShouldBe([Monday.AddDays(2), Monday.AddDays(4), Monday.AddDays(5)]);

        // Saturday sits beside Sunday's long run: allowed here (the app warns), unlike Move my long run.
        var moved = LifeHappens.Propose(Plan(), today, new(LifeSituation.MoveRun, Date: Monday.AddDays(1), MoveTo: Monday.AddDays(5)), []);
        var sessions = RemainingWeek.Apply(Plan(), moved.Changes).Weeks[0].Sessions;
        sessions.ShouldContain(s => s.Date == Monday.AddDays(5) && s.Type == SessionType.Intervals && s.DistanceKm == 9);
        sessions.ShouldNotContain(s => s.Date == Monday.AddDays(1));

        Should.Throw<DomainException>(() => LifeHappens.Propose(Plan(), today, new(LifeSituation.MoveRun, Date: Monday.AddDays(1), MoveTo: Monday.AddDays(3)), []));
        Should.Throw<DomainException>(() => LifeHappens.Propose(Plan(), today, new(LifeSituation.MoveRun, Date: Monday.AddDays(2)), []));
        Should.Throw<DomainException>(() => LifeHappens.Propose(Plan(), Monday.AddDays(3), new(LifeSituation.MoveRun, Date: Monday.AddDays(1)), []));
    }

    [Fact]
    public void A_shakeout_moves_from_thursday_to_friday_before_saturday_race()
    {
        var raceDay = Monday.AddDays(5);
        var plan = new TrainingPlan(Distance.FromKilometres(21.0975), DistanceCategory.HalfMarathon,
            raceDay, TimeSpan.FromMinutes(110), Monday,
            new Dictionary<PaceZone, PaceRange> {
                [PaceZone.Easy] = new(Pace.FromSecondsPerKilometre(330), Pace.FromSecondsPerKilometre(360))
            },
            [new PlanWeek(1, Monday, TrainingPhase.Taper, false,
                [Run(3, SessionType.Shakeout, 4.5), Run(5, SessionType.Race, 21.0975)])], []);

        var thursday = Monday.AddDays(3);
        var friday = Monday.AddDays(4);
        var choice = LifeHappens.Propose(plan, thursday, new(LifeSituation.MoveRun, Date: thursday), []);
        choice.MoveTargets.ShouldContain(friday);

        var moved = LifeHappens.Propose(plan, thursday, new(LifeSituation.MoveRun, Date: thursday, MoveTo: friday), []);
        var days = RemainingWeek.Apply(plan, moved.Changes).Weeks[0].Sessions;
        days.ShouldContain(s => s.Date == friday && s.Type == SessionType.Shakeout && s.DistanceKm == 4.5);
        days.ShouldNotContain(s => s.Date == thursday && s.Type == SessionType.Shakeout);
        days.ShouldContain(s => s.Date == raceDay && s.Type == SessionType.Race);
    }

    [Fact]
    public void A_hard_workout_still_cannot_move_to_race_eve()
    {
        var raceDay = Monday.AddDays(5);
        var plan = new TrainingPlan(Distance.FromKilometres(21.0975), DistanceCategory.HalfMarathon,
            raceDay, TimeSpan.FromMinutes(110), Monday,
            new Dictionary<PaceZone, PaceRange> {
                [PaceZone.Easy] = new(Pace.FromSecondsPerKilometre(330), Pace.FromSecondsPerKilometre(360))
            },
            [new PlanWeek(1, Monday, TrainingPhase.Taper, false,
                [Run(3, SessionType.Intervals, 4.5), Run(5, SessionType.Race, 21.0975)])], []);
        var thursday = Monday.AddDays(3);
        var friday = Monday.AddDays(4);
        var choice = LifeHappens.Propose(plan, thursday, new(LifeSituation.MoveRun, Date: thursday), []);
        choice.MoveTargets.ShouldNotContain(friday);
        Should.Throw<DomainException>(() => LifeHappens.Propose(plan, thursday,
            new(LifeSituation.MoveRun, Date: thursday, MoveTo: friday), []));
    }

    [Fact]
    public void A_long_run_moves_only_to_a_free_day_with_no_hard_run_either_side_and_rests_its_old_day()
    {
        var today = Monday;
        var offered = LifeHappens.Propose(Plan(), today, new(LifeSituation.MoveLongRun), []);
        // Wed sits next to Tuesday's intervals; Fri and Sat are free and clear.
        offered.MoveTargets.ShouldBe([Monday.AddDays(4), Monday.AddDays(5)]);
        offered.Changes.ShouldBeEmpty();

        var moved = LifeHappens.Propose(Plan(), today, new(LifeSituation.MoveLongRun, MoveTo: Monday.AddDays(5)), []);
        moved.Changes.Count.ShouldBe(2);
        moved.Changes[0].ShouldSatisfyAllConditions(c => c.Date.ShouldBe(Monday.AddDays(6)), c => c.EasyKm.ShouldBeNull());
        moved.Changes[1].ShouldSatisfyAllConditions(c => c.Date.ShouldBe(Monday.AddDays(5)), c => c.MovedFrom.ShouldBe(Monday.AddDays(6)));

        var applied = RemainingWeek.Apply(Plan(), moved.Changes);
        var sessions = applied.Weeks[0].Sessions;
        sessions.ShouldContain(s => s.Date == Monday.AddDays(5) && s.Type == SessionType.LongRun && s.DistanceKm == 16);
        sessions.ShouldNotContain(s => s.Date == Monday.AddDays(6));
        Should.Throw<DomainException>(() => LifeHappens.Propose(Plan(), today, new(LifeSituation.MoveLongRun, MoveTo: Monday.AddDays(2)), []));
    }

    [Fact]
    public void A_missed_key_session_can_be_made_up_on_a_safe_day_but_a_missed_easy_run_is_let_go()
    {
        var today = Monday.AddDays(3);
        var intervals = LifeHappens.Propose(Plan(), today, new(LifeSituation.MissedRun, Date: Monday.AddDays(1)), []);
        // Friday is clear; Saturday is the day before Sunday's long run, so not offered.
        intervals.MoveTargets.ShouldBe([Monday.AddDays(4)]);
        var made = LifeHappens.Propose(Plan(), today, new(LifeSituation.MissedRun, Date: Monday.AddDays(1), MoveTo: Monday.AddDays(4)), []);
        made.Changes.ShouldHaveSingleItem().MovedFrom.ShouldBe(Monday.AddDays(1));
        // The missed day stays in history as it was.
        RemainingWeek.Apply(Plan(), made.Changes).Weeks[0].Sessions.ShouldContain(s => s.Date == Monday.AddDays(1) && s.Type == SessionType.Intervals);

        LifeHappens.Propose(Plan(), today, new(LifeSituation.MissedRun, Date: Monday), []).MoveTargets.ShouldBeEmpty();
    }

    [Fact]
    public void Short_on_time_turns_a_hard_session_into_an_easy_run_that_fits()
    {
        var change = LifeHappens.Propose(Plan(), Monday, new(LifeSituation.ShortOnTime, Date: Monday.AddDays(1), Minutes: 30), []).Changes.ShouldHaveSingleItem();
        // 30 minutes at 6:00/km is 5 km of easy running.
        change.EasyKm.ShouldBe(5);
        change.OriginalType.ShouldBe(SessionType.Intervals);
        // An easy run that already fits stays as it is.
        LifeHappens.Propose(Plan(), Monday, new(LifeSituation.ShortOnTime, Date: Monday, Minutes: 60), []).Changes.ShouldBeEmpty();
    }

    [Fact]
    public void Unwell_rests_the_days_given_then_eases_the_next_two_runs()
    {
        var changes = LifeHappens.Propose(Plan(), Monday, new(LifeSituation.Unwell, Days: 2), []).Changes;
        changes.Where(c => c.EasyKm is null).Select(c => c.Date).ShouldBe([Monday, Monday.AddDays(1)]);
        // Thursday's 7 km easy and Sunday's long run come back capped at 5 km.
        changes.Where(c => c.EasyKm is not null).Select(c => (c.Date, c.EasyKm)).ShouldBe([(Monday.AddDays(3), 5.0), (Monday.AddDays(6), 5.0)]);
    }

    [Fact]
    public void Travelling_without_running_rests_those_days_and_a_restore_undoes_a_move_whole()
    {
        var resting = LifeHappens.Propose(Plan(), Monday, new(LifeSituation.Travelling, Date: Monday, Until: Monday.AddDays(1), CanRun: false), []).Changes;
        resting.Select(c => c.Date).ShouldBe([Monday, Monday.AddDays(1)]);
        resting.ShouldAllBe(c => c.EasyKm == null);

        var saved = SavedPlan.Create(Guid.NewGuid(), "Club half", new SavedPlanInputs(null, "Club half", 21.1, new DateOnly(2026, 12, 20), TimeSpan.FromMinutes(110),
            [DayOfWeek.Tuesday, DayOfWeek.Sunday], DayOfWeek.Sunday, 30, Experience.Regular, [], Monday));
        var move = LifeHappens.Propose(Plan(), Monday, new(LifeSituation.MoveLongRun, MoveTo: Monday.AddDays(4)), []).Changes;
        saved.ApplyLifeChange(move, Monday);
        saved.Adjustments.Count.ShouldBe(2);
        saved.RestoreOriginal([Monday.AddDays(4)], Monday);
        saved.Adjustments.ShouldBeEmpty();
        Should.Throw<DomainException>(() => saved.ApplyLifeChange([move[0] with { Date = Monday.AddDays(-1) }], Monday));
    }
}
