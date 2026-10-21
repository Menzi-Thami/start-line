using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>The coach's calls applied to a plan: every training rule still holds.</summary>
public sealed class CoachedPlanTests
{
    // Built Thursday 8 October: 20 weeks from Monday 12 October to a marathon on 28 February. Weeks 1–7 base, 8–13 build.
    private static readonly PlanParameters Marathon = new(
        Distance.Marathon,
        TimeSpan.FromHours(4),
        new DateOnly(2027, 2, 28),
        new DateOnly(2026, 10, 8),
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
        DayOfWeek.Sunday,
        40);

    private static DateOnly WeekStart(int number) => new DateOnly(2026, 10, 12).AddDays(7 * (number - 1));

    private static CoachDecision Call(int week, bool hold = false, int dose = 0, bool cutback = false) =>
        new(WeekStart(week), CoachVerdict.Struggling, hold, dose, cutback, [CoachReason.FeltHarderThanPlanned]);

    private static TrainingPlan Coached(params CoachDecision[] calls) => TrainingPlanGenerator.Generate(Marathon with { Coaching = calls });

    private static readonly TrainingPlan AsWritten = TrainingPlanGenerator.Generate(Marathon);

    private static PlanWeek Week(TrainingPlan plan, int number) => plan.Weeks.Single(w => w.Number == number);

    private static IEnumerable<PlannedSession> Hard(PlanWeek week) => week.Sessions.Where(s => ExpectedEffort.IsHard(s.Type));

    [Fact]
    public void A_plan_with_only_as_planned_calls_is_the_plan_as_written()
    {
        var plan = Coached(CoachDecision.AsPlanned(WeekStart(9), CoachVerdict.OnTrack, CoachReason.RanAsPlanned));

        plan.Weeks.SelectMany(w => w.Sessions).ShouldBe(AsWritten.Weeks.SelectMany(w => w.Sessions));
    }

    [Fact]
    public void Weeks_before_the_first_call_are_unchanged()
    {
        var plan = Coached(Call(9, hold: true, dose: -1));

        plan.Weeks.Take(8).SelectMany(w => w.Sessions).ShouldBe(AsWritten.Weeks.Take(8).SelectMany(w => w.Sessions));
    }

    [Fact]
    public void A_held_week_runs_no_more_than_the_week_before()
    {
        var plan = Coached(Call(9, hold: true));

        // Week 8 is a cutback, so the last full week is week 7.
        Week(plan, 8).IsCutback.ShouldBeTrue();
        Week(plan, 9).PlannedKm.ShouldBeLessThanOrEqualTo(Week(plan, 7).PlannedKm);
        Week(plan, 9).PlannedKm.ShouldBeLessThan(Week(AsWritten, 9).PlannedKm);
    }

    [Fact]
    public void A_step_down_keeps_one_smaller_hard_session()
    {
        var plan = Coached(Call(9, dose: -1));

        Week(AsWritten, 9).Sessions.Count(s => ExpectedEffort.IsHard(s.Type)).ShouldBe(2);
        var hard = Hard(Week(plan, 9)).ShouldHaveSingleItem();
        hard.DistanceKm.ShouldBeLessThanOrEqualTo(Hard(Week(AsWritten, 9)).First().DistanceKm);
        Week(plan, 9).Sessions.Count(s => s.Type != SessionType.Strength).ShouldBe(5);
    }

    [Fact]
    public void A_step_up_makes_the_hard_sessions_bigger()
    {
        // Week 9 is early in Build, so its sessions have room to grow.
        var plan = Coached(Call(9, dose: 1) with { Verdict = CoachVerdict.Thriving });

        Hard(Week(plan, 9)).Sum(s => s.DistanceKm).ShouldBeGreaterThan(Hard(Week(AsWritten, 9)).Sum(s => s.DistanceKm));
    }

    [Fact]
    public void The_easier_week_comes_now_when_the_coach_brings_it_forward()
    {
        var plan = Coached(Call(10, hold: true, dose: -1, cutback: true));

        var week = Week(plan, 10);
        week.IsCutback.ShouldBeTrue();
        week.PlannedKm.ShouldBeLessThanOrEqualTo(Week(plan, 9).PlannedKm * 0.85);
        Hard(week).ShouldBeEmpty();
    }

    [Fact]
    public void A_coached_plan_never_grows_more_than_10_percent_after_the_first_call()
    {
        var plan = Coached(Call(9, hold: true, dose: -1), Call(10, hold: true, dose: -1));
        var full = plan.Weeks.Where(w => w.Number >= 8 && w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak && !w.IsCutback).ToList();

        full.Zip(full.Skip(1)).ShouldAllBe(pair => pair.Second.PlannedKm <= Math.Round(pair.First.PlannedKm * 1.10, 1) + 0.05);
    }

    [Fact]
    public void A_coached_plan_keeps_hard_days_apart_long_run_caps_and_a_light_race_week()
    {
        var plan = Coached(Call(9, dose: 1), Call(12, hold: true, dose: -1));
        PaceZone?[] hardZones = [PaceZone.Interval, PaceZone.Tempo, PaceZone.Race, PaceZone.LongRun];

        var hardDates = plan.Weeks.SelectMany(w => w.Sessions).Where(s => hardZones.Contains(s.Zone) && s.Type != SessionType.Race).Select(s => s.Date).Order().ToList();
        hardDates.Zip(hardDates.Skip(1)).ShouldAllBe(pair => pair.Second.DayNumber - pair.First.DayNumber > 1);
        plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).ShouldAllBe(s => s.DistanceKm <= 32);
        plan.Weeks[^1].Sessions.Count(s => s.Title == "Race-pace sharpener").ShouldBe(1);
    }

    [Fact]
    public void The_coachs_calls_still_apply_after_a_replan()
    {
        var replan = new PlanReplan(new DateOnly(2026, 12, 3), Setback.MissedTraining);
        var replanned = TrainingPlanGenerator.Generate(Marathon with { Replan = replan });
        var coached = TrainingPlanGenerator.Generate(Marathon with { Replan = replan, Coaching = [Call(11, dose: -1)] });

        Hard(Week(replanned, 11)).Count().ShouldBe(2);
        Hard(Week(coached, 11)).ShouldHaveSingleItem();
    }
}
