using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>
/// Generator v2's per-distance shapes, one named rule each. Every older rule still holds for v2 too: the V2 subclasses of
/// the other generator test classes run them all again with <see cref="TrainingPlanGenerator.LatestVersion"/>.
/// </summary>
public sealed class PlanShapesV2Tests
{
    private static readonly DateOnly Today = new(2026, 10, 8);

    private static readonly DayOfWeek[] FourDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];
    private static readonly DayOfWeek[] FiveDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static PlanParameters Race(
        double km,
        TimeSpan goal,
        DateOnly raceDate,
        double? currentWeeklyKm = 40,
        Experience experience = Experience.Regular,
        DayOfWeek[]? runDays = null) => new(
            Distance.FromKilometres(km), goal, raceDate, Today, runDays ?? FiveDays, DayOfWeek.Sunday, currentWeeklyKm, experience,
            GeneratorVersion: TrainingPlanGenerator.LatestVersion);

    private static PlanParameters Marathon(double? currentWeeklyKm = 40, TimeSpan? goal = null) =>
        Race(42.195, goal ?? TimeSpan.FromHours(4), new DateOnly(2027, 2, 28), currentWeeklyKm);

    private static PlanParameters FiveK() => Race(5, TimeSpan.FromMinutes(24), new DateOnly(2027, 1, 10), currentWeeklyKm: 25);

    private static TrainingPlan V1(PlanParameters parameters) =>
        TrainingPlanGenerator.Generate(parameters with { GeneratorVersion = TrainingPlanGenerator.OriginalVersion });

    private static List<PlanWeek> FullBuildingWeeks(TrainingPlan plan) =>
        [.. plan.Weeks.Where(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak && !w.IsCutback)];

    private static double LongRun(PlanWeek week) =>
        week.Sessions.Single(s => s.Type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace).DistanceKm;

    private static IEnumerable<PlannedSession> HardSessions(PlanWeek week) =>
        week.Sessions.Where(s => s.Zone is PaceZone.Interval or PaceZone.Tempo or PaceZone.Race && s.Type != SessionType.Race
            && s.Type is not (SessionType.LongRunFastFinish or SessionType.LongRunRacePace));

    [Fact]
    public void V2_marathon_long_run_steps_then_holds()
    {
        var longRuns = FullBuildingWeeks(TrainingPlanGenerator.Generate(Marathon())).Select(LongRun).ToList();
        var peak = longRuns.Max();
        var climbing = longRuns.TakeWhile(km => km < peak).Append(peak).ToList();
        var steps = climbing.Zip(climbing.Skip(1), (a, b) => b - a).ToList();

        // 12 → 14, 14 → 16, 16 → 18…: each 2 km step is followed by a week at the same distance.
        steps.ShouldAllBe(step => step >= 0 && step <= 2);
        steps.Count(step => step == 2).ShouldBeGreaterThanOrEqualTo(3);
        steps.Zip(steps.Skip(1)).ShouldAllBe(pair => pair.First == 0 || pair.Second == 0);
        longRuns.SkipWhile(km => km < peak).ShouldAllBe(km => km == peak);
    }

    [Theory]
    [InlineData(21.0975, 105, 1.5)]
    [InlineData(56, 360, 2.5)]
    [InlineData(90, 660, 3)]
    public void V2_half_and_ultra_long_runs_step_by_their_distance(double km, int goalMinutes, double stepKm)
    {
        var plan = TrainingPlanGenerator.Generate(Race(km, TimeSpan.FromMinutes(goalMinutes), new DateOnly(2027, 4, 25), currentWeeklyKm: 50));
        var longRuns = FullBuildingWeeks(plan).Select(LongRun).ToList();
        var steps = longRuns.Zip(longRuns.Skip(1), (a, b) => b - a).Where(step => step > 0).ToList();

        steps.ShouldNotBeEmpty();
        steps.ShouldAllBe(step => step <= stepKm);
        steps.ShouldContain(stepKm);
    }

    [Fact]
    public void V2_long_runs_keep_the_distance_and_time_caps()
    {
        var strong = TrainingPlanGenerator.Generate(Marathon(currentWeeklyKm: 90));
        var slow = TrainingPlanGenerator.Generate(Marathon(currentWeeklyKm: 60, goal: TimeSpan.FromHours(6)));
        var comrades = TrainingPlanGenerator.Generate(Race(90, TimeSpan.FromHours(9), new DateOnly(2027, 6, 13), currentWeeklyKm: 80));

        strong.Weeks.SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).ShouldAllBe(s => s.DistanceKm <= 32);
        comrades.Weeks.SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).ShouldAllBe(s => s.DistanceKm <= 45);
        var longest = slow.Weeks.SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).Max(s => s.DistanceKm);
        slow.Paces[PaceZone.LongRun].Midpoint.TimeFor(Distance.FromKilometres(longest)).ShouldBeLessThanOrEqualTo(TimeSpan.FromMinutes(195 + 3));
    }

    [Fact]
    public void V2_long_run_is_never_more_than_half_the_week()
    {
        var plan = TrainingPlanGenerator.Generate(Race(21.0975, TimeSpan.FromHours(2.5), new DateOnly(2027, 2, 28), null, Experience.New, FourDays));

        plan.Weeks.Where(w => w.Phase != TrainingPhase.RaceWeek).ShouldAllBe(w => LongRun(w) <= Math.Max(5, w.PlannedKm * 0.5 + 0.25));
    }

    [Fact]
    public void V2_volume_grows_in_bigger_steps_early_and_flatter_near_the_peak()
    {
        var weeks = FullBuildingWeeks(TrainingPlanGenerator.Generate(Marathon())).Select(w => w.PlannedKm).ToList();
        var middle = weeks[weeks.Count / 2];

        (middle / weeks[0]).ShouldBeGreaterThan(weeks[^1] / middle);
    }

    public static TheoryData<double, int, Experience, int, double> Runners()
    {
        var data = new TheoryData<double, int, Experience, int, double>();
        foreach (var (km, goalMinutes) in new[] { (5.0, 25), (10.0, 52), (21.0975, 115), (42.195, 240), (56.0, 390) })
        {
            foreach (var experience in Enum.GetValues<Experience>())
            {
                foreach (var runs in new[] { 3, 4, 5, 6 })
                {
                    foreach (var now in new[] { 25.0, 40, 70 })
                    {
                        data.Add(km, goalMinutes, experience, runs, now);
                    }
                }
            }
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Runners))]
    public void V2_never_grows_volume_more_than_10_percent_a_week(double km, int goalMinutes, Experience experience, int runs, double currentKm)
    {
        DayOfWeek[] days = runs switch
        {
            3 => [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday],
            4 => FourDays,
            5 => FiveDays,
            _ => [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
        };
        var plan = TrainingPlanGenerator.Generate(Race(km, TimeSpan.FromMinutes(goalMinutes), new DateOnly(2027, 3, 28), currentKm, experience, days));
        var weeks = FullBuildingWeeks(plan);

        // On the distance the runs really add up to, not just the target (rounded to 0.1 km for display).
        weeks[0].PlannedKm.ShouldBeLessThanOrEqualTo(currentKm * 1.1 + 0.05);
        weeks.Zip(weeks.Skip(1)).ShouldAllBe(pair => pair.Second.PlannedKm <= pair.First.PlannedKm * 1.1 + 0.05);
    }

    [Fact]
    public void V2_a_build_week_keeps_at_least_one_hard_session()
    {
        // A new runner on low volume: there isn't room for two hard sessions, but one stays.
        var plan = TrainingPlanGenerator.Generate(Race(21.0975, TimeSpan.FromHours(2.25), new DateOnly(2027, 2, 28), null, Experience.New, FourDays));

        FullBuildingWeeks(plan).Where(w => w.Phase != TrainingPhase.Base).ShouldAllBe(w => HardSessions(w).Any());
    }

    [Theory]
    [InlineData(5, 24, 25)]
    [InlineData(10, 50, 30)]
    public void V2_5K_and_10K_volume_levels_off_before_the_end_of_the_build(double km, int goalMinutes, double currentKm)
    {
        var parameters = Race(km, TimeSpan.FromMinutes(goalMinutes), new DateOnly(2027, 1, 10), currentKm);

        // Full weeks at the end of the build that sit at its peak, give or take what the hard sessions add as they grow.
        static int WeeksAtPeak(TrainingPlan plan)
        {
            var weeks = FullBuildingWeeks(plan).Select(w => w.PlannedKm).ToList();
            var peak = weeks.Max();
            return weeks.AsEnumerable().Reverse().TakeWhile(planned => planned >= peak * 0.9).Count();
        }

        WeeksAtPeak(TrainingPlanGenerator.Generate(parameters)).ShouldBeGreaterThanOrEqualTo(4);
        WeeksAtPeak(TrainingPlanGenerator.Generate(parameters)).ShouldBeGreaterThan(WeeksAtPeak(V1(parameters)));
    }

    [Fact]
    public void V2_5K_and_10K_progress_through_the_session_dose()
    {
        var plan = TrainingPlanGenerator.Generate(FiveK());
        var peakWeeks = plan.Weeks.Where(w => w.Phase == TrainingPhase.Peak && !w.IsCutback).ToList();

        // With the volume held, both hard sessions stay and grow through the peak phase: the progression is in the dose.
        peakWeeks.ShouldAllBe(w => HardSessions(w).Count() == 2);
        var work = peakWeeks.Select(w => HardSessions(w).Sum(s => s.Shape.WorkKm)).ToList();
        work.Zip(work.Skip(1)).ShouldAllBe(pair => pair.Second > pair.First);
        peakWeeks[^1].PlannedKm.ShouldBeLessThanOrEqualTo(peakWeeks[0].PlannedKm * 1.1);
    }

    [Fact]
    public void V2_new_runners_cut_back_every_third_week()
    {
        var plan = TrainingPlanGenerator.Generate(Race(21.0975, TimeSpan.FromHours(2.25), new DateOnly(2027, 2, 28), 25, Experience.New, FourDays));

        plan.Weeks.Where(w => w.IsCutback).Select(w => w.Number).ShouldBe([3, 6, 9, 12]);
    }

    [Theory]
    [InlineData(Experience.Regular)]
    [InlineData(Experience.Experienced)]
    public void V2_regular_and_experienced_runners_still_cut_back_every_fourth_week(Experience experience)
    {
        var plan = TrainingPlanGenerator.Generate(Race(21.0975, TimeSpan.FromHours(1.75), new DateOnly(2027, 2, 28), 40, experience, FourDays));

        plan.Weeks.Where(w => w.IsCutback).Select(w => w.Number).ShouldBe([4, 8, 12]);
    }

    [Fact]
    public void Version_1_new_runners_still_cut_back_every_fourth_week()
    {
        var plan = V1(Race(21.0975, TimeSpan.FromHours(2.25), new DateOnly(2027, 2, 28), 25, Experience.New, FourDays));

        plan.Weeks.Where(w => w.IsCutback).Select(w => w.Number).ShouldBe([4, 8, 12]);
    }

    [Fact]
    public void V2_replan_keeps_the_plans_own_version()
    {
        var replan = new PlanReplan(new DateOnly(2026, 12, 3), Setback.Illness);
        var original = TrainingPlanGenerator.Generate(Marathon());
        var replanned = TrainingPlanGenerator.Generate(Marathon() with { Replan = replan });
        var replannedAsV1 = V1(Marathon() with { Replan = replan });

        // The weeks before the replan are the v2 plan's weeks, and the rebuild follows v2's long-run track.
        var kept = replanned.Weeks.Where(w => !w.IsReplanned).ToList();
        kept.Zip(original.Weeks).ShouldAllBe(pair => pair.First.Sessions.SequenceEqual(pair.Second.Sessions));
        replanned.Weeks.Select(w => w.PlannedKm).ShouldNotBe(replannedAsV1.Weeks.Select(w => w.PlannedKm));
    }

    [Fact]
    public void A_plan_without_a_version_is_version_1()
    {
        var unversioned = new PlanParameters(Distance.Marathon, TimeSpan.FromHours(4), new DateOnly(2027, 2, 28), Today, FiveDays, DayOfWeek.Sunday, 40);

        unversioned.GeneratorVersion.ShouldBe(TrainingPlanGenerator.OriginalVersion);
        TrainingPlanGenerator.Generate(unversioned).Weeks.SelectMany(w => w.Sessions)
            .SequenceEqual(V1(Marathon()).Weeks.SelectMany(w => w.Sessions)).ShouldBeTrue();
    }

    [Fact]
    public void Version_2_changes_the_shape_of_the_plan()
    {
        var v2 = TrainingPlanGenerator.Generate(Marathon());

        v2.Weeks.Select(w => w.PlannedKm).ShouldNotBe(V1(Marathon()).Weeks.Select(w => w.PlannedKm));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    public void Rejects_an_unknown_version(int version) =>
        Should.Throw<DomainException>(() => TrainingPlanGenerator.Generate(Marathon() with { GeneratorVersion = version }));
}
