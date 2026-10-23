using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>Every run says how to run it, step by step, and the steps never disagree with the session.</summary>
public sealed class SessionStepsTests
{
    private static readonly DateOnly Today = new(2026, 10, 8);

    private static readonly DayOfWeek[] FiveDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static TrainingPlan Plan(double km, int goalMinutes, int version = TrainingPlanGenerator.OriginalVersion, DayOfWeek[]? strength = null) =>
        TrainingPlanGenerator.Generate(new PlanParameters(
            Distance.FromKilometres(km), TimeSpan.FromMinutes(goalMinutes), new DateOnly(2027, 3, 28), Today, FiveDays, DayOfWeek.Sunday, 40,
            StrengthDays: strength, GeneratorVersion: version));

    private static IEnumerable<PlannedSession> Sessions(TrainingPlan plan) => plan.Weeks.SelectMany(w => w.Sessions);

    private static IEnumerable<SessionStep> Flat(IEnumerable<SessionStep> steps) =>
        steps.SelectMany(s => s.Block is { } block ? Flat(block).Prepend(s) : [s]);

    public static TheoryData<double, int, int> Races() => new()
    {
        { 5, 25, 1 }, { 10, 52, 1 }, { 21.0975, 115, 1 }, { 42.195, 240, 1 }, { 56, 390, 1 }, { 90, 660, 1 },
        { 5, 25, 2 }, { 10, 52, 2 }, { 21.0975, 115, 2 }, { 42.195, 240, 2 }, { 56, 390, 2 }, { 90, 660, 2 },
    };

    [Theory]
    [MemberData(nameof(Races))]
    public void Every_run_says_how_to_run_it_and_strength_keeps_its_exercise_list(double km, int goalMinutes, int version)
    {
        var plan = Plan(km, goalMinutes, version, [DayOfWeek.Monday]);

        Sessions(plan).Where(s => s.Type != SessionType.Strength).ShouldAllBe(s => s.Steps != null && s.Steps.Count > 0);
        Sessions(plan).Where(s => s.Type == SessionType.Strength).ShouldAllBe(s => s.Steps == null && s.Exercises != null);
    }

    [Theory]
    [MemberData(nameof(Races))]
    public void Every_step_is_a_distance_or_a_time_and_a_pace_or_a_feel(double km, int goalMinutes, int version)
    {
        var steps = Sessions(Plan(km, goalMinutes, version)).Where(s => s.Steps != null).SelectMany(s => Flat(s.Steps!)).ToList();

        steps.Where(s => s.Kind == StepKind.Repeat).ShouldAllBe(s => s.Times > 1 && s.Block != null && s.Block.Count > 0);
        steps.Where(s => s.Kind is StepKind.Run or StepKind.WarmUp or StepKind.CoolDown)
            .ShouldAllBe(s => (s.DistanceKm > 0 || s.Duration > TimeSpan.Zero) && (s.Pace != null || s.Effort != null));
        steps.Where(s => s.Kind == StepKind.Recover).ShouldAllBe(s => s.Effort != null);
    }

    [Fact]
    public void Intervals_are_a_warm_up_the_reps_with_their_jogs_and_a_cool_down()
    {
        var plan = Plan(5, 25);
        var intervals = Sessions(plan).First(s => s.Type == SessionType.Intervals);
        var steps = intervals.Steps!;

        steps.Select(s => s.Kind).ShouldBe([StepKind.WarmUp, StepKind.Repeat, StepKind.CoolDown]);
        steps[0].DistanceKm.ShouldBe(2);
        steps[0].Pace.ShouldBe(plan.Paces[PaceZone.Easy]);
        steps[2].DistanceKm.ShouldBe(1.5);

        // The same reps, distance and jog the detail describes ("Warm up, then 5 × 800 m at interval pace with 90 s jog between.").
        var reps = steps[1];
        var rep = reps.Block![0];
        reps.Times.ShouldBe((int)Math.Round(intervals.Shape.WorkKm / (intervals.Shape.RepMetres!.Value / 1000)));
        rep.DistanceKm.ShouldBe(intervals.Shape.RepMetres!.Value / 1000);
        rep.Pace.ShouldBe(plan.Paces[PaceZone.Interval]);
        intervals.Detail.ShouldContain($"{reps.Times} × {intervals.Shape.RepMetres!.Value:0} m");
        reps.Block[1].Kind.ShouldBe(StepKind.Recover);
        intervals.Detail.ShouldContain(reps.Block[1].Duration!.Value.TotalSeconds < 120 ? $"{reps.Block[1].Duration!.Value.TotalSeconds:0} s jog" : "2 min jog");
    }

    [Fact]
    public void A_tempo_run_holds_tempo_pace_for_the_minutes_the_detail_gives()
    {
        var plan = Plan(42.195, 240);
        var tempo = Sessions(plan).First(s => s.Type == SessionType.Tempo);
        var work = tempo.Steps![1];

        work.Zone.ShouldBe(PaceZone.Tempo);
        work.Pace.ShouldBe(plan.Paces[PaceZone.Tempo]);
        tempo.Detail.ShouldContain($"{work.Duration!.Value.TotalMinutes:0} min continuous at tempo pace");
    }

    [Fact]
    public void Long_runs_with_race_pace_add_up_to_the_whole_run()
    {
        var sessions = Sessions(Plan(42.195, 240)).Where(s => s.Type is SessionType.LongRunFastFinish or SessionType.LongRunRacePace).ToList();

        sessions.ShouldNotBeEmpty();
        sessions.ShouldAllBe(s => Math.Abs(s.Steps!.Sum(step => step.DistanceKm ?? 0) - s.DistanceKm) < 1e-9);
        sessions.ShouldAllBe(s => s.Steps!.Any(step => step.Zone == PaceZone.Race && step.DistanceKm == s.Shape.WorkKm));
    }

    [Fact]
    public void Strides_follow_the_easy_running()
    {
        var strides = Sessions(Plan(10, 52)).First(s => s.Type == SessionType.EasyWithStrides).Steps!;

        strides[0].Zone.ShouldBe(PaceZone.Easy);
        strides[1].Times.ShouldBe(6);
        strides[1].Block![0].Duration.ShouldBe(TimeSpan.FromSeconds(20));
        strides[1].Block![1].Effort.ShouldBe("Walk back");
    }

    [Fact]
    public void Hills_and_fartlek_are_run_by_feel_not_by_a_pace()
    {
        var sessions = Sessions(Plan(42.195, 240)).Where(s => s.Type is SessionType.Hills or SessionType.Fartlek).ToList();

        sessions.ShouldNotBeEmpty();
        sessions.SelectMany(s => s.Steps![1].Block!).Where(step => step.Kind == StepKind.Run)
            .ShouldAllBe(step => step.Pace == null && step.Effort != null && step.Duration > TimeSpan.Zero);
    }

    [Fact]
    public void The_same_answers_give_the_same_steps()
    {
        Sessions(Plan(21.0975, 115)).Select(s => s.Steps).SequenceEqual(Sessions(Plan(21.0975, 115)).Select(s => s.Steps)).ShouldBeTrue();
    }
}
