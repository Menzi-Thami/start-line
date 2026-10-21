using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>Training paces that follow the runner's fitness, week by week, with race pace at the goal.</summary>
public sealed class FitnessPacedPlanTests
{
    // 20 weeks from Monday 12 October to a 4-hour marathon goal on 28 February.
    private static readonly PlanParameters Marathon = new(
        Distance.Marathon,
        TimeSpan.FromHours(4),
        new DateOnly(2027, 2, 28),
        new DateOnly(2026, 10, 8),
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
        DayOfWeek.Sunday,
        40);

    private static DateOnly WeekStart(int number) => new DateOnly(2026, 10, 12).AddDays(7 * (number - 1));

    private static CoachDecision Call(int week, CoachVerdict verdict = CoachVerdict.OnTrack, TimeSpan? fitness = null, double paceFactor = 1) =>
        CoachDecision.AsPlanned(WeekStart(week), verdict, CoachReason.RanAsPlanned) with { Fitness = fitness, PaceFactor = paceFactor };

    private static TrainingPlan Plan(params CoachDecision[] calls) => TrainingPlanGenerator.Generate(Marathon with { Coaching = calls });

    private static readonly TrainingPlan AsWritten = TrainingPlanGenerator.Generate(Marathon);

    private static double Slowest(TrainingPlan plan, PaceZone zone) => plan.Paces[zone].Slowest.SecondsPerKilometre;

    [Fact]
    public void A_runner_slower_than_their_goal_trains_at_todays_fitness()
    {
        var plan = Plan(Call(9, fitness: TimeSpan.FromMinutes(260)));

        Slowest(plan, PaceZone.Easy).ShouldBeGreaterThan(Slowest(AsWritten, PaceZone.Easy));
        Slowest(plan, PaceZone.Tempo).ShouldBeGreaterThan(Slowest(AsWritten, PaceZone.Tempo));
        plan.Paces[PaceZone.Race].ShouldBe(AsWritten.Paces[PaceZone.Race]);
    }

    [Fact]
    public void Weeks_before_the_fitness_call_keep_the_paces_they_were_run_at()
    {
        var plan = Plan(Call(9, fitness: TimeSpan.FromMinutes(260)));

        plan.Weeks.Take(8).SelectMany(w => w.Sessions).ShouldBe(AsWritten.Weeks.Take(8).SelectMany(w => w.Sessions));
    }

    [Fact]
    public void Slower_paces_mean_shorter_time_based_sessions_from_the_call_on()
    {
        var plan = Plan(Call(9, fitness: TimeSpan.FromMinutes(270)));

        // The long run's time cap and the tempo minutes both buy fewer kilometres at a slower pace.
        var weeksAfter = plan.Weeks.Where(w => w.Number >= 9 && w.Phase != TrainingPhase.RaceWeek).ToList();
        var asWritten = AsWritten.Weeks.Where(w => w.Number >= 9 && w.Phase != TrainingPhase.RaceWeek).ToList();
        weeksAfter.Zip(asWritten).ShouldAllBe(pair => pair.First.PlannedKm <= pair.Second.PlannedKm + 0.05);
    }

    [Fact]
    public void Fitness_ahead_of_the_goal_keeps_the_goals_paces()
    {
        var plan = Plan(Call(9, fitness: TimeSpan.FromMinutes(225)));

        plan.Paces.ShouldBe(AsWritten.Paces);
        plan.SuggestedGoal.ShouldBeNull();
    }

    [Fact]
    public void Three_strong_weeks_with_fitness_ahead_of_the_goal_suggest_a_faster_one()
    {
        var plan = Plan(
            Call(9, CoachVerdict.Thriving, TimeSpan.FromMinutes(232)),
            Call(10, CoachVerdict.Thriving, TimeSpan.FromMinutes(230)),
            Call(11, CoachVerdict.Thriving, TimeSpan.FromSeconds(13_712)));

        plan.SuggestedGoal.ShouldBe(TimeSpan.FromMinutes(229));
        plan.Warnings.ShouldContain(w => w.Code == "goal-within-reach");
        plan.GoalTime.ShouldBe(TimeSpan.FromHours(4));
    }

    [Fact]
    public void Two_strong_weeks_are_not_yet_enough_to_suggest_a_faster_goal()
    {
        var plan = Plan(Call(10, CoachVerdict.Thriving, TimeSpan.FromMinutes(230)), Call(11, CoachVerdict.Thriving, TimeSpan.FromMinutes(229)));

        plan.SuggestedGoal.ShouldBeNull();
    }

    [Fact]
    public void A_pace_nudge_eases_the_paces_for_a_runner_without_recorded_runs()
    {
        var plan = Plan(Call(9, paceFactor: 1.02));

        (Slowest(plan, PaceZone.Tempo) / Slowest(AsWritten, PaceZone.Tempo)).ShouldBeInRange(1.015, 1.025);
        plan.Paces[PaceZone.Race].ShouldBe(AsWritten.Paces[PaceZone.Race]);
    }

    [Fact]
    public void A_fitness_paced_plan_keeps_every_training_rule()
    {
        var plan = Plan(Call(9, fitness: TimeSpan.FromMinutes(270)));
        PaceZone?[] hardZones = [PaceZone.Interval, PaceZone.Tempo, PaceZone.Race, PaceZone.LongRun];

        var hardDates = plan.Weeks.SelectMany(w => w.Sessions).Where(s => hardZones.Contains(s.Zone) && s.Type != SessionType.Race).Select(s => s.Date).Order().ToList();
        hardDates.Zip(hardDates.Skip(1)).ShouldAllBe(pair => pair.Second.DayNumber - pair.First.DayNumber > 1);
        plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).ShouldAllBe(s => s.DistanceKm <= 32);
        plan.Weeks[^1].Sessions[^1].Type.ShouldBe(SessionType.Race);
    }
}
