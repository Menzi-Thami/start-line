using System.Text.Json;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>The coach's read on the goal: realistic or not, and why. Every rule here is named, and none changes a plan.</summary>
public class GoalOutlookTests
{
    // Built on a Thursday: the plan runs 20 weeks from Monday 12 October to a marathon on Sunday 28 February.
    private static readonly DateOnly Today = new(2026, 10, 8);
    private static readonly DateOnly RaceDate = new(2027, 2, 28);

    // A 10K in 50:00 a week ago: about 3:50 for a marathon today.
    private static readonly RecentResult TenKInFifty = new(Distance.TenK, TimeSpan.FromMinutes(50), new DateOnly(2026, 10, 1));

    private static PlanParameters Marathon(
        TimeSpan? goal = null,
        double? currentWeeklyKm = 40,
        Experience experience = Experience.Regular,
        DateOnly? raceDate = null,
        PlanReplan? replan = null,
        IReadOnlyList<CoachDecision>? coaching = null,
        int version = TrainingPlanGenerator.OriginalVersion) => new(
            Distance.Marathon,
            goal ?? TimeSpan.FromHours(4),
            raceDate ?? RaceDate,
            Today,
            [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
            DayOfWeek.Sunday,
            currentWeeklyKm,
            experience,
            Replan: replan,
            Coaching: coaching,
            GeneratorVersion: version);

    private static GoalOutlook Assess(PlanParameters p, RecentResult? recent = null, DateOnly? asOf = null) =>
        TrainingPlanGenerator.AssessGoal(p, TrainingPlanGenerator.Generate(p), asOf ?? Today, recent);

    private static TimeSpan Hm(int hours, int minutes) => new(hours, minutes, 0);

    // Worst to best, so a slower goal can only move the verdict up.
    private static int Rank(GoalVerdict verdict) => verdict switch
    {
        GoalVerdict.AtRisk => 0,
        GoalVerdict.Stretch => 1,
        GoalVerdict.OnTrack => 2,
        GoalVerdict.AheadOfGoal => 3,
        _ => throw new ArgumentOutOfRangeException(nameof(verdict)),
    };

    [Fact]
    public void A_goal_slower_than_todays_fitness_points_higher()
    {
        var outlook = Assess(Marathon(Hm(4, 0)), TenKInFifty);

        outlook.Verdict.ShouldBe(GoalVerdict.AheadOfGoal);
        var higher = outlook.SuggestedGoal.ShouldNotBeNull();
        higher.ShouldBeLessThan(Hm(4, 0));
        higher.ShouldBeGreaterThan(outlook.FitnessToday!.Value * 0.9);
        (higher.TotalSeconds % 60).ShouldBe(0);
        outlook.Summary.ShouldContain("fitter");
    }

    [Fact]
    public void Fitness_today_is_the_result_carried_to_the_race_distance()
    {
        var outlook = Assess(Marathon(), TenKInFifty);

        var expected = Fitness.Estimate(Distance.Marathon, Today.AddDays(1), [new Effort(TenKInFifty.Date, 10_000, TenKInFifty.Time)]);
        outlook.FitnessToday.ShouldBe(expected);
        outlook.Reasons.ShouldContain(r => r.Code == "fitness-today");
    }

    [Fact]
    public void A_goal_within_reach_of_the_gain_is_realistic()
    {
        var outlook = Assess(Marathon(Hm(3, 47)), TenKInFifty);

        outlook.Verdict.ShouldBe(GoalVerdict.OnTrack);
        outlook.SuggestedGoal.ShouldBeNull();
        outlook.Summary.ShouldContain("realistic");
    }

    [Fact]
    public void A_goal_that_needs_most_of_the_gain_is_a_stretch()
    {
        var outlook = Assess(Marathon(Hm(3, 40)), TenKInFifty);

        outlook.Verdict.ShouldBe(GoalVerdict.Stretch);
        outlook.SuggestedGoal.ShouldBeNull();
        outlook.Summary.ShouldContain("stretch");
    }

    [Fact]
    public void A_goal_beyond_the_gain_is_at_risk_and_a_more_realistic_one_is_offered()
    {
        var outlook = Assess(Marathon(Hm(3, 30)), TenKInFifty);

        outlook.Verdict.ShouldBe(GoalVerdict.AtRisk);
        var realistic = outlook.SuggestedGoal.ShouldNotBeNull();
        realistic.ShouldBeGreaterThan(Hm(3, 30));
        realistic.ShouldBeLessThan(outlook.FitnessToday!.Value);
        (realistic.TotalSeconds % 60).ShouldBe(0);
        outlook.Summary.ShouldContain("keeps your goal until you change it");
    }

    [Fact]
    public void A_short_race_goal_is_suggested_to_ten_seconds()
    {
        // A 5K in 24:00 three weeks ago is about 50 minutes for a 10K; 42:00 is far faster than ten weeks can deliver.
        var p = new PlanParameters(
            Distance.TenK, TimeSpan.FromMinutes(42), new DateOnly(2026, 12, 20), Today,
            [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday], DayOfWeek.Sunday, 30);
        var result = new RecentResult(Distance.FiveK, new TimeSpan(0, 24, 0), new DateOnly(2026, 9, 17));

        var outlook = Assess(p, result);

        outlook.Verdict.ShouldBe(GoalVerdict.AtRisk);
        (outlook.SuggestedGoal!.Value.TotalSeconds % 10).ShouldBe(0);
        outlook.SuggestedGoal.Value.ShouldBeGreaterThan(TimeSpan.FromMinutes(42));
    }

    [Fact]
    public void Without_a_result_only_the_build_is_judged_and_the_runner_is_asked_for_one()
    {
        var outlook = Assess(Marathon());

        outlook.Verdict.ShouldBe(GoalVerdict.NotAssessed);
        outlook.FitnessToday.ShouldBeNull();
        outlook.SuggestedGoal.ShouldBeNull();
        outlook.Reasons.ShouldContain(r => r.Code == "no-result");
        outlook.Reasons.ShouldContain(r => r.Code == "build-enough");
    }

    [Fact]
    public void A_result_that_is_too_old_or_too_short_cannot_be_used_and_says_so()
    {
        var tooOld = new RecentResult(Distance.TenK, TimeSpan.FromMinutes(50), Today.AddDays(-Fitness.WindowDays - 5));
        var tooShort = new RecentResult(Distance.FromKilometres(2), TimeSpan.FromMinutes(8), Today.AddDays(-7));

        foreach (var result in new[] { tooOld, tooShort })
        {
            var outlook = Assess(Marathon(), result);
            outlook.Verdict.ShouldBe(GoalVerdict.NotAssessed);
            outlook.FitnessToday.ShouldBeNull();
            outlook.Reasons.ShouldContain(r => r.Code == "result-too-old");
        }
    }

    [Fact]
    public void A_shorter_build_has_less_to_gain()
    {
        var goal = Hm(3, 47);
        var long20 = Assess(Marathon(goal), TenKInFifty);
        var short8 = Assess(Marathon(goal, raceDate: new DateOnly(2026, 12, 6)), TenKInFifty);

        long20.Verdict.ShouldBe(GoalVerdict.OnTrack);
        Rank(short8.Verdict).ShouldBeLessThan(Rank(long20.Verdict));
    }

    [Fact]
    public void A_newer_runner_has_more_to_gain_than_an_experienced_one()
    {
        var goal = Hm(3, 40);
        var newer = Assess(Marathon(goal, experience: Experience.New), TenKInFifty);
        var experienced = Assess(Marathon(goal, experience: Experience.Experienced), TenKInFifty);

        Rank(newer.Verdict).ShouldBeGreaterThan(Rank(experienced.Verdict));
    }

    [Fact]
    public void Ultras_are_judged_on_the_build_not_the_time()
    {
        var p = new PlanParameters(
            Distance.FromKilometres(56), new TimeSpan(6, 30, 0), new DateOnly(2027, 4, 3), Today,
            [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday], DayOfWeek.Saturday, 40);
        var result = new RecentResult(Distance.TenK, TimeSpan.FromMinutes(50), new DateOnly(2026, 10, 1));

        var outlook = Assess(p, result);

        outlook.Verdict.ShouldBe(GoalVerdict.NotAssessed);
        outlook.FitnessToday.ShouldBeNull();
        outlook.SuggestedGoal.ShouldBeNull();
        outlook.Reasons.ShouldContain(r => r.Code == "ultra-prediction");
    }

    [Fact]
    public void A_replan_that_costs_little_stays_on_track_and_says_why()
    {
        var outlook = Assess(Marathon(replan: new PlanReplan(new DateOnly(2026, 12, 3), Setback.MissedTraining)), asOf: new DateOnly(2026, 12, 3));

        outlook.Verdict.ShouldBe(GoalVerdict.OnTrack);
        outlook.Summary.ShouldContain("still realistic");
        outlook.Reasons.ShouldContain(r => r.Code == "replanned" && r.Message.Contains("missed training") && r.Message.Contains("weeks remain"));
        outlook.Reasons.ShouldContain(r => r.Code == "build-kept");
    }

    [Fact]
    public void A_replan_with_no_time_to_win_the_training_back_puts_the_goal_at_risk()
    {
        var p = Marathon(replan: new PlanReplan(new DateOnly(2027, 1, 20), Setback.Injury));
        var plan = TrainingPlanGenerator.Generate(p);

        var outlook = TrainingPlanGenerator.AssessGoal(p, plan, new DateOnly(2027, 1, 20));

        outlook.Verdict.ShouldBe(GoalVerdict.AtRisk);
        outlook.SuggestedGoal.ShouldBe(plan.SuggestedGoal);
        outlook.Reasons.ShouldContain(r => r.Code == "replanned" && r.Message.Contains("injury"));
    }

    [Fact]
    public void Coach_calls_that_change_weeks_are_counted_in_the_reasons()
    {
        var calls = new[]
        {
            new CoachDecision(new DateOnly(2026, 11, 2), CoachVerdict.Struggling, HoldVolume: true, DoseStep: 0, CutbackNow: false, [CoachReason.RanAsPlanned]),
            CoachDecision.AsPlanned(new DateOnly(2026, 11, 9), CoachVerdict.OnTrack, CoachReason.RanAsPlanned),
            new CoachDecision(new DateOnly(2026, 11, 16), CoachVerdict.Struggling, HoldVolume: false, DoseStep: -1, CutbackNow: false, [CoachReason.RanAsPlanned]),
        };

        var outlook = Assess(Marathon(coaching: calls), asOf: new DateOnly(2026, 11, 16));

        outlook.Reasons.ShouldContain(r => r.Code == "coach-adjusted" && r.Message.Contains("2 weeks"));
        outlook.Verdict.ShouldBe(GoalVerdict.OnTrack);
    }

    [Fact]
    public void Fitness_from_recorded_runs_is_used_in_place_of_a_result_the_runner_gave()
    {
        var calls = new[]
        {
            new CoachDecision(new DateOnly(2026, 11, 2), CoachVerdict.OnTrack, HoldVolume: false, DoseStep: 0, CutbackNow: false, [CoachReason.RanAsPlanned], Fitness: Hm(3, 52)),
        };

        var outlook = Assess(Marathon(Hm(3, 47), coaching: calls), TenKInFifty with { Time = TimeSpan.FromMinutes(70) }, new DateOnly(2026, 11, 2));

        outlook.FitnessToday.ShouldBe(Hm(3, 52));
        outlook.Reasons.ShouldContain(r => r.Code == "fitness-today" && r.Message.Contains("recent runs"));
    }

    [Fact]
    public void Strong_runs_that_beat_the_goal_point_higher()
    {
        var calls = Enumerable.Range(0, 3)
            .Select(i => new CoachDecision(new DateOnly(2026, 11, 2).AddDays(7 * i), CoachVerdict.Thriving, HoldVolume: false, DoseStep: 1, CutbackNow: false, [CoachReason.RanAsPlanned], Fitness: Hm(3, 40)))
            .ToList();

        var outlook = Assess(Marathon(Hm(4, 0), coaching: calls), asOf: new DateOnly(2026, 11, 16));

        outlook.Verdict.ShouldBe(GoalVerdict.AheadOfGoal);
        outlook.SuggestedGoal!.Value.ShouldBeLessThan(Hm(4, 0));
    }

    [Fact]
    public void A_thin_build_is_never_called_realistic_or_better()
    {
        // A new runner on 10 km a week with 11 weeks to go: the plan can't build to what a marathon needs.
        var p = Marathon(Hm(4, 30), currentWeeklyKm: 10, experience: Experience.New, raceDate: new DateOnly(2026, 12, 27));
        var plan = TrainingPlanGenerator.Generate(p);
        plan.Warnings.ShouldContain(w => w.Code == "low-volume");

        var outlook = TrainingPlanGenerator.AssessGoal(p, plan, Today, TenKInFifty with { Time = TimeSpan.FromMinutes(46) });

        outlook.Verdict.ShouldBeOneOf(GoalVerdict.Stretch, GoalVerdict.AtRisk);
        outlook.Reasons.ShouldContain(r => r.Code == "build-thin");
    }

    [Fact]
    public void A_slower_goal_can_only_move_the_verdict_up_and_suggestions_always_point_the_right_way()
    {
        var verdicts = new List<GoalVerdict>();
        for (var minutes = 170; minutes <= 330; minutes += 5)
        {
            var goal = TimeSpan.FromMinutes(minutes);
            var outlook = Assess(Marathon(goal), TenKInFifty);
            verdicts.Add(outlook.Verdict);

            switch (outlook.Verdict)
            {
                case GoalVerdict.AheadOfGoal:
                    outlook.SuggestedGoal.ShouldNotBeNull().ShouldBeLessThan(goal);
                    break;
                case GoalVerdict.AtRisk when outlook.SuggestedGoal is { } realistic:
                    realistic.ShouldBeGreaterThan(goal);
                    break;
                case GoalVerdict.OnTrack or GoalVerdict.Stretch:
                    outlook.SuggestedGoal.ShouldBeNull();
                    break;
            }
        }

        verdicts.Select(Rank).ShouldBe(verdicts.Select(Rank).OrderBy(r => r));
        verdicts.Distinct().Count().ShouldBe(4);
    }

    [Fact]
    public void Every_message_is_a_whole_sentence_without_stray_numbers()
    {
        for (var minutes = 170; minutes <= 330; minutes += 20)
        {
            foreach (var result in new RecentResult?[] { null, TenKInFifty })
            {
                var outlook = Assess(Marathon(TimeSpan.FromMinutes(minutes)), result);
                foreach (var text in outlook.Reasons.Select(r => r.Message).Append(outlook.Summary))
                {
                    text.ShouldEndWith(".");
                    text.ShouldNotContain("NaN");
                    text.ShouldNotContain("Infinity");
                    text.ShouldNotContain("-");
                }
            }
        }
    }

    [Fact]
    public void Assessing_a_goal_never_changes_the_plan()
    {
        var p = Marathon(replan: new PlanReplan(new DateOnly(2026, 12, 3), Setback.Illness));
        var plan = TrainingPlanGenerator.Generate(p);
        var before = JsonSerializer.Serialize(plan);

        _ = TrainingPlanGenerator.AssessGoal(p, plan, new DateOnly(2026, 12, 3), TenKInFifty);

        JsonSerializer.Serialize(plan).ShouldBe(before);
        JsonSerializer.Serialize(TrainingPlanGenerator.Generate(p)).ShouldBe(before);
    }

    private static IReadOnlyList<CoachDecision> ThrivingWeeks(int count, TimeSpan fitness) => Enumerable.Range(0, count)
        .Select(i => new CoachDecision(new DateOnly(2026, 11, 2).AddDays(7 * i), CoachVerdict.Thriving, HoldVolume: false, DoseStep: 1, CutbackNow: false, [CoachReason.RanAsPlanned], Fitness: fitness))
        .ToList();

    // ---- One plan never gives two verdicts on the same goal: the outlook defers to what already judges goals.

    [Fact]
    public void With_recorded_runs_one_strong_estimate_is_not_enough_to_aim_higher()
    {
        // The plan's own rule asks for three thriving weeks in a row before it suggests a faster goal. The outlook says the same, not sooner.
        var p = Marathon(Hm(4, 0), coaching: ThrivingWeeks(1, Hm(3, 40)));
        var plan = TrainingPlanGenerator.Generate(p);
        plan.SuggestedGoal.ShouldBeNull();

        var outlook = TrainingPlanGenerator.AssessGoal(p, plan, new DateOnly(2026, 11, 2));

        outlook.Verdict.ShouldNotBe(GoalVerdict.AheadOfGoal);
        outlook.SuggestedGoal.ShouldBeNull();
    }

    [Fact]
    public void Three_strong_weeks_suggest_the_very_goal_the_plan_does()
    {
        var p = Marathon(Hm(4, 0), coaching: ThrivingWeeks(3, Hm(3, 40)));
        var plan = TrainingPlanGenerator.Generate(p);
        var suggestedByPlan = plan.SuggestedGoal.ShouldNotBeNull();

        var outlook = TrainingPlanGenerator.AssessGoal(p, plan, new DateOnly(2026, 11, 16));

        outlook.Verdict.ShouldBe(GoalVerdict.AheadOfGoal);
        outlook.SuggestedGoal.ShouldBe(suggestedByPlan);
        outlook.Reasons.ShouldContain(r => r.Code == "three-strong-weeks");
    }

    [Fact]
    public void A_result_the_runner_gives_suggests_what_the_coach_would_after_three_strong_weeks()
    {
        // Same rounding as the plan's own faster goal: what the runner could run today, to the minute.
        var outlook = Assess(Marathon(Hm(4, 0)), TenKInFifty);

        outlook.SuggestedGoal.ShouldBe(TimeSpan.FromMinutes(Math.Round(outlook.FitnessToday!.Value.TotalMinutes)));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void The_outlook_and_the_low_volume_warning_never_disagree(int version)
    {
        // Whatever the plan's own shape can reach: a build the generator warns about is never called realistic, and one it doesn't is never called thin.
        var weeksToRace = new[] { 8, 12, 16, 24 };
        foreach (var km in new double?[] { 8, 15, 25, 40, 60 })
        {
            foreach (var experience in Enum.GetValues<Experience>())
            {
                foreach (var weeks in weeksToRace)
                {
                    var p = Marathon(Hm(4, 30), km, experience, Today.AddDays(7 * weeks + 3), version: version);
                    var plan = TrainingPlanGenerator.Generate(p);
                    var lowVolume = plan.Warnings.Any(w => w.Code == "low-volume");

                    foreach (var result in new RecentResult?[] { null, TenKInFifty with { Time = TimeSpan.FromMinutes(46) } })
                    {
                        var outlook = TrainingPlanGenerator.AssessGoal(p, plan, Today, result);
                        var where = $"v{version}, {km} km, {experience}, {weeks} weeks";

                        outlook.Reasons.Any(r => r.Code == "build-thin").ShouldBe(lowVolume, where);
                        if (lowVolume)
                        {
                            outlook.Verdict.ShouldBeOneOf(GoalVerdict.Stretch, GoalVerdict.AtRisk);
                        }
                    }
                }
            }
        }
    }

    [Fact]
    public void A_rebuild_judges_the_goal_by_its_own_rule_and_no_second_one()
    {
        // The replan keeps the goal unless the setback cost more training than there is time to win back. The outlook says what it says.
        foreach (var setback in Enum.GetValues<Setback>())
        {
            foreach (var from in new[] { new DateOnly(2026, 11, 4), new DateOnly(2026, 12, 3), new DateOnly(2027, 1, 6), new DateOnly(2027, 1, 20) })
            {
                var p = Marathon(Hm(4, 0), replan: new PlanReplan(from, setback, setback == Setback.Behind ? 20 : null));
                var plan = TrainingPlanGenerator.Generate(p);
                var outlook = TrainingPlanGenerator.AssessGoal(p, plan, from);
                var where = $"{setback} on {from}";

                var replanSaysSlower = plan.SuggestedGoal is { } suggested && suggested > p.GoalTime;
                (outlook.Verdict == GoalVerdict.AtRisk).ShouldBe(replanSaysSlower, where);
                if (replanSaysSlower)
                {
                    outlook.SuggestedGoal.ShouldBe(plan.SuggestedGoal, where);
                }
                else
                {
                    outlook.Verdict.ShouldBe(GoalVerdict.OnTrack, where);
                }
            }
        }
    }
}
