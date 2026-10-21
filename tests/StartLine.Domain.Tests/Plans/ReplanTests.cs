using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>"Replan from here": every rule of a fresh plan still holds after a setback, and each new rule is named here.</summary>
public sealed class ReplanTests
{
    // Built on a Thursday: the plan runs 20 weeks from Monday 12 October to a marathon on Sunday 28 February.
    private static readonly DateOnly Built = new(2026, 10, 8);
    private static readonly DateOnly RaceDate = new(2027, 2, 28);

    // A Thursday in week 8 (which starts Monday 30 November). The rebuild starts Monday 7 December, week 9.
    private static readonly DateOnly ReplanDay = new(2026, 12, 3);
    private static readonly DateOnly RestartMonday = new(2026, 12, 7);

    private static readonly PaceZone?[] HardZones = [PaceZone.Interval, PaceZone.Tempo, PaceZone.Race];

    private static PlanParameters Marathon(
        PlanReplan? replan = null,
        int runsPerWeek = 5,
        double? currentWeeklyKm = 40,
        TimeSpan? goal = null) => new(
            Distance.Marathon,
            goal ?? TimeSpan.FromHours(4),
            RaceDate,
            Built,
            runsPerWeek switch
            {
                6 => [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
                _ => [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
            },
            DayOfWeek.Sunday,
            currentWeeklyKm,
            Replan: replan);

    private static TrainingPlan Original(PlanParameters parameters) =>
        TrainingPlanGenerator.Generate(parameters with { Replan = null });

    private static TrainingPlan Replan(Setback setback, DateOnly? from = null, double? lastWeekKm = null, PlanParameters? parameters = null) =>
        TrainingPlanGenerator.Generate((parameters ?? Marathon()) with { Replan = new PlanReplan(from ?? ReplanDay, setback, lastWeekKm) });

    private static List<PlanWeek> Rebuilt(TrainingPlan plan) => [.. plan.Weeks.Where(w => w.StartDate >= RestartMonday)];

    private static List<PlanWeek> RebuiltBuilding(TrainingPlan plan) =>
        [.. Rebuilt(plan).Where(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak)];

    // The bigger of the two weeks before the replan week.
    private static double Baseline(TrainingPlan original) =>
        original.Weeks.Where(w => w.StartDate < ReplanDay.AddDays(-3)).TakeLast(2).Max(w => w.PlannedKm);

    [Fact]
    public void Replan_keeps_weeks_before_the_replan_unchanged()
    {
        var original = Original(Marathon());
        var plan = Replan(Setback.Illness);

        plan.StartDate.ShouldBe(original.StartDate);
        var kept = plan.Weeks.TakeWhile(w => w.StartDate < ReplanDay.AddDays(-3)).ToList();
        kept.Count.ShouldBe(7);
        kept.ShouldAllBe(w => !w.IsReplanned);
        kept.Zip(original.Weeks).ShouldAllBe(pair => pair.First.Sessions.SequenceEqual(pair.Second.Sessions));
    }

    [Fact]
    public void Replan_keeps_the_race_date_goal_and_week_numbers()
    {
        var plan = Replan(Setback.Injury);

        plan.GoalTime.ShouldBe(TimeSpan.FromHours(4));
        plan.Weeks[^1].Sessions[^1].Type.ShouldBe(SessionType.Race);
        plan.Weeks[^1].Sessions[^1].Date.ShouldBe(RaceDate);
        plan.Weeks.Select(w => w.Number).ShouldBe(Enumerable.Range(1, 20));
        plan.Replan.ShouldBe(new PlanReplan(ReplanDay, Setback.Injury));
    }

    [Fact]
    public void Replan_keeps_each_week_in_the_phase_its_dates_had()
    {
        var original = Original(Marathon());
        var plan = Replan(Setback.MissedTraining);

        plan.Weeks.Select(w => w.Phase).ShouldBe(original.Weeks.Select(w => w.Phase));
        Rebuilt(plan).ShouldAllBe(w => w.IsReplanned);
    }

    [Fact]
    public void Replan_after_illness_rests_for_the_rest_of_this_week()
    {
        var plan = Replan(Setback.Illness);

        var thisWeek = plan.Weeks.Single(w => w.StartDate == new DateOnly(2026, 11, 30));
        thisWeek.IsReplanned.ShouldBeTrue();
        thisWeek.Sessions.ShouldAllBe(s => s.Date < ReplanDay);
    }

    [Fact]
    public void Replan_after_missed_training_turns_the_rest_of_this_week_easy()
    {
        var plan = Replan(Setback.MissedTraining);

        var rest = plan.Weeks.Single(w => w.StartDate == new DateOnly(2026, 11, 30)).Sessions.Where(s => s.Date >= ReplanDay).ToList();
        rest.ShouldNotBeEmpty();
        rest.ShouldAllBe(s => s.Zone == PaceZone.Easy || s.Zone == PaceZone.Recovery || s.Type == SessionType.Strength);
    }

    [Fact]
    public void Replan_after_illness_starts_with_an_easy_only_week()
    {
        var plan = Replan(Setback.Illness);
        var rebuilt = RebuiltBuilding(plan);

        AssertEasyOnly(rebuilt[0]);
        rebuilt[1].Sessions.ShouldContain(s => HardZones.Contains(s.Zone));
    }

    [Fact]
    public void Replan_after_injury_has_two_easy_only_weeks()
    {
        var plan = Replan(Setback.Injury);
        var rebuilt = RebuiltBuilding(plan);

        AssertEasyOnly(rebuilt[0]);
        AssertEasyOnly(rebuilt[1]);
        rebuilt[2].Sessions.ShouldContain(s => HardZones.Contains(s.Zone));
        plan.Warnings.ShouldContain(w => w.Code == "injury");
    }

    [Theory]
    [InlineData(Setback.MissedTraining)]
    [InlineData(Setback.Behind)]
    public void Replan_without_illness_or_injury_keeps_the_hard_sessions(Setback setback)
    {
        var plan = Replan(setback, lastWeekKm: 30);

        RebuiltBuilding(plan)[0].Sessions.ShouldContain(s => HardZones.Contains(s.Zone));
    }

    [Theory]
    [InlineData(Setback.MissedTraining, 0.8)]
    [InlineData(Setback.Illness, 0.6)]
    [InlineData(Setback.Injury, 0.5)]
    public void Replan_restarts_at_a_share_of_what_the_runner_had_built(Setback setback, double share)
    {
        var baseline = Baseline(Original(Marathon()));
        var plan = Replan(setback);

        // A little headroom for distances being rounded to the nearest half kilometre.
        RebuiltBuilding(plan)[0].PlannedKm.ShouldBeInRange(baseline * share * 0.9, baseline * share * 1.1);
    }

    [Fact]
    public void Replan_never_restarts_more_than_10_percent_above_last_week()
    {
        var plan = Replan(Setback.MissedTraining, lastWeekKm: 20);

        RebuiltBuilding(plan)[0].PlannedKm.ShouldBeLessThanOrEqualTo(22 * 1.05);
    }

    [Fact]
    public void Replan_behind_picks_up_from_last_week()
    {
        var plan = Replan(Setback.Behind, lastWeekKm: 25);

        RebuiltBuilding(plan)[0].PlannedKm.ShouldBeInRange(25 * 0.9, 25 * 1.1);
    }

    [Fact]
    public void Replan_behind_never_restarts_above_the_baseline()
    {
        var baseline = Baseline(Original(Marathon()));
        var plan = Replan(Setback.Behind, lastWeekKm: 200);

        RebuiltBuilding(plan)[0].PlannedKm.ShouldBeLessThanOrEqualTo(baseline * 1.05);
    }

    [Theory]
    [InlineData(Setback.MissedTraining)]
    [InlineData(Setback.Illness)]
    [InlineData(Setback.Injury)]
    [InlineData(Setback.Behind)]
    public void Replan_never_grows_volume_more_than_10_percent_a_week(Setback setback)
    {
        var plan = Replan(setback, lastWeekKm: 25);
        var building = RebuiltBuilding(plan).Where(w => !w.IsCutback).ToList();

        // Enforced on the rounded distances themselves, so no headroom: cutbacks aside, never more than 10% up.
        building.Zip(building.Skip(1)).ShouldAllBe(pair => pair.Second.PlannedKm <= Math.Round(pair.First.PlannedKm * 1.10, 1) + 0.05);
        building[0].PlannedKm.ShouldBeLessThanOrEqualTo(Baseline(Original(Marathon())) * 1.05);
    }

    [Fact]
    public void Replan_keeps_only_the_hard_sessions_a_low_volume_week_has_room_for()
    {
        // 18 km over five runs: a long run and four short runs, with no room for set-length hard sessions.
        var week = RebuiltBuilding(Replan(Setback.Behind, lastWeekKm: 18))[0];

        week.PlannedKm.ShouldBeLessThanOrEqualTo(18 * 1.1);
        week.Sessions.ShouldNotContain(s => HardZones.Contains(s.Zone));
        week.Sessions.Where(s => s.Zone != PaceZone.LongRun).ShouldAllBe(s => s.DistanceKm >= 3);
        week.Sessions.Count(s => s.Type != SessionType.Strength).ShouldBe(5);
    }

    [Fact]
    public void Replan_never_peaks_above_the_original_plan()
    {
        var original = Original(Marathon());
        var plan = Replan(Setback.MissedTraining, from: new DateOnly(2026, 10, 22));

        Rebuilt(plan).Max(w => w.PlannedKm).ShouldBeLessThanOrEqualTo(original.Weeks.Max(w => w.PlannedKm) * 1.02);
    }

    [Fact]
    public void Replan_restarts_the_cutback_count()
    {
        var rebuilt = RebuiltBuilding(Replan(Setback.Illness));

        rebuilt.Count.ShouldBe(9);
        rebuilt.Select(w => w.IsCutback).ShouldBe([false, false, false, true, false, false, false, true, false]);
        rebuilt[3].PlannedKm.ShouldBeLessThan(rebuilt[2].PlannedKm);
    }

    [Theory]
    [InlineData(Setback.MissedTraining)]
    [InlineData(Setback.Illness)]
    public void Replan_keeps_hard_days_apart(Setback setback)
    {
        var plan = Replan(setback, parameters: Marathon(runsPerWeek: 6));
        PaceZone?[] hard = [PaceZone.Interval, PaceZone.Tempo, PaceZone.Race, PaceZone.LongRun];

        var hardDates = plan.Weeks.SelectMany(w => w.Sessions)
            .Where(s => hard.Contains(s.Zone) && s.Type != SessionType.Race)
            .Select(s => s.Date)
            .Order()
            .ToList();
        hardDates.Zip(hardDates.Skip(1)).ShouldAllBe(pair => pair.Second.DayNumber - pair.First.DayNumber > 1);
    }

    [Fact]
    public void Replan_caps_long_runs_by_distance()
    {
        var plan = Replan(Setback.MissedTraining, from: new DateOnly(2026, 10, 22), parameters: Marathon(currentWeeklyKm: 90));

        Rebuilt(plan).SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).ShouldAllBe(s => s.DistanceKm <= 32);
    }

    [Fact]
    public void Replan_caps_long_runs_by_time_for_slower_runners()
    {
        var plan = Replan(Setback.MissedTraining, from: new DateOnly(2026, 10, 22),
            parameters: Marathon(goal: TimeSpan.FromHours(6), currentWeeklyKm: 60));
        var longPace = plan.Paces[PaceZone.LongRun].Midpoint;

        var longest = Rebuilt(plan).SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).Max(s => s.DistanceKm);
        longPace.TimeFor(Distance.FromKilometres(longest)).ShouldBeLessThanOrEqualTo(TimeSpan.FromMinutes(195 + 3));
    }

    [Fact]
    public void Replan_tapers_into_a_light_race_week()
    {
        var plan = Replan(Setback.Illness);
        var peak = RebuiltBuilding(plan).Max(w => w.PlannedKm);

        var taper = plan.Weeks.Where(w => w.Phase == TrainingPhase.Taper).Select(w => w.PlannedKm).ToList();
        taper[0].ShouldBeLessThan(peak);
        taper[1].ShouldBeLessThan(taper[0]);

        var raceWeek = plan.Weeks[^1].Sessions;
        raceWeek.Count(s => s.Title == "Race-pace sharpener").ShouldBe(1);
        raceWeek.Where(s => s.Type != SessionType.Race).Sum(s => s.DistanceKm).ShouldBeLessThan(taper[1]);
    }

    [Fact]
    public void Replan_during_the_taper_still_ends_in_a_light_race_week()
    {
        // Ill in the first taper week (8 February): one easy week, then race week.
        var plan = Replan(Setback.Illness, from: new DateOnly(2027, 2, 10));

        AssertEasyOnly(plan.Weeks.Single(w => w.StartDate == new DateOnly(2027, 2, 15)));
        plan.Weeks[^1].Sessions.Count(s => s.Title == "Race-pace sharpener").ShouldBe(1);
        plan.SuggestedGoal.ShouldBeNull();
    }

    [Fact]
    public void Replan_with_time_to_recover_keeps_the_goal()
    {
        var plan = Replan(Setback.MissedTraining, from: new DateOnly(2026, 10, 22));

        plan.SuggestedGoal.ShouldBeNull();
        plan.Warnings.ShouldNotContain(w => w.Code == "goal-at-risk");
    }

    [Fact]
    public void Replan_keeps_the_goal_while_the_rebuild_still_reaches_what_the_race_needs()
    {
        // Ill in week 4 of a 16-week half: the rebuilt peak sits below the original, but not below what a half needs.
        var half = Marathon(runsPerWeek: 4, currentWeeklyKm: 30) with
        {
            RaceDistance = Distance.HalfMarathon,
            GoalTime = TimeSpan.FromMinutes(110),
            RaceDate = new DateOnly(2027, 1, 24),
            Today = new DateOnly(2026, 9, 28),
            RunDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
        };

        var plan = Replan(Setback.Illness, from: new DateOnly(2026, 10, 21), parameters: half);

        plan.SuggestedGoal.ShouldBeNull();
        plan.Warnings.ShouldNotContain(w => w.Code == "goal-at-risk");
    }

    [Fact]
    public void Replan_warns_and_suggests_a_goal_when_volume_falls_short()
    {
        // Injured five weeks out: there's no time to build back to the original peak.
        var plan = Replan(Setback.Injury, from: new DateOnly(2027, 1, 20));

        plan.Warnings.ShouldContain(w => w.Code == "goal-at-risk");
        var suggested = plan.SuggestedGoal.ShouldNotBeNull();
        suggested.ShouldBeGreaterThan(TimeSpan.FromHours(4));
        suggested.ShouldBeLessThanOrEqualTo(TimeSpan.FromHours(4 * 1.1));
        (suggested.TotalSeconds % 60).ShouldBe(0);
        plan.GoalTime.ShouldBe(TimeSpan.FromHours(4));
    }

    [Fact]
    public void Replan_rounds_a_short_race_goal_to_ten_seconds()
    {
        var parameters = Marathon() with { RaceDistance = Distance.TenK, GoalTime = TimeSpan.FromMinutes(50), RaceDate = new DateOnly(2027, 1, 17) };
        var plan = Replan(Setback.Injury, from: new DateOnly(2026, 12, 23), parameters: parameters);

        var suggested = plan.SuggestedGoal.ShouldNotBeNull();
        suggested.ShouldBeGreaterThan(TimeSpan.FromMinutes(50));
        (suggested.TotalSeconds % 10).ShouldBe(0);
    }

    [Fact]
    public void Replan_drops_the_warnings_about_the_first_build()
    {
        var plan = Replan(Setback.Illness, parameters: Marathon(currentWeeklyKm: 10));

        plan.Warnings.ShouldNotContain(w => w.Code == "low-volume");
    }

    [Fact]
    public void The_same_replan_always_gives_the_same_plan()
    {
        var first = Replan(Setback.Illness, lastWeekKm: 18);
        var second = Replan(Setback.Illness, lastWeekKm: 18);

        second.Weeks.SelectMany(w => w.Sessions).ShouldBe(first.Weeks.SelectMany(w => w.Sessions));
    }

    [Fact]
    public void Rejects_a_replan_with_the_race_too_close() =>
        Should.Throw<DomainException>(() => Replan(Setback.Illness, from: new DateOnly(2027, 2, 23)))
            .Message.ShouldContain("too close");

    [Fact]
    public void Rejects_a_replan_from_before_the_plan_was_built() =>
        Should.Throw<DomainException>(() => Replan(Setback.Illness, from: Built.AddDays(-1)));

    [Fact]
    public void Rejects_running_behind_without_last_weeks_distance() =>
        Should.Throw<DomainException>(() => Replan(Setback.Behind));

    private static void AssertEasyOnly(PlanWeek week)
    {
        week.Sessions.ShouldNotContain(s => HardZones.Contains(s.Zone));
        week.Sessions.ShouldNotContain(s => s.Type == SessionType.EasyWithStrides || s.Type == SessionType.MediumLongRun);
        week.Sessions.Where(s => s.Zone == PaceZone.LongRun).ShouldAllBe(s => s.Type == SessionType.LongRun);
    }
}
