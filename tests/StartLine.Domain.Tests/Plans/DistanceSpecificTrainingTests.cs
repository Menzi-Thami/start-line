using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>Each race distance trains differently, not just with different mileage.</summary>
public class DistanceSpecificTrainingTests
{
    // Every rule here holds for both generator versions: the subclass at the end runs them all again for version 2.
    protected virtual int Version => TrainingPlanGenerator.OriginalVersion;

    private TrainingPlan Generate(PlanParameters parameters) => TrainingPlanGenerator.Generate(parameters with { GeneratorVersion = Version });

    private static readonly DateOnly Today = new(2026, 10, 8);

    private static readonly DayOfWeek[] FiveDays =
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private TrainingPlan PlanFor(double km, TimeSpan goal, DateOnly? raceDate = null) =>
        Generate(new PlanParameters(
            Distance.FromKilometres(km), goal, raceDate ?? new DateOnly(2027, 3, 28), Today, FiveDays, DayOfWeek.Sunday, 40));

    private static List<PlannedSession> Sessions(TrainingPlan plan) =>
        [.. plan.Weeks.Where(w => w.Phase != TrainingPhase.RaceWeek).SelectMany(w => w.Sessions)];

    private static double ShareOf(TrainingPlan plan, PaceZone zone)
    {
        var hard = Sessions(plan).Where(s => s.Zone is PaceZone.Interval or PaceZone.Tempo or PaceZone.Race).ToList();
        return hard.Count(s => s.Zone == zone) / (double)hard.Count;
    }

    [Fact]
    public void A_5K_plan_is_weighted_towards_speed_and_a_marathon_towards_threshold()
    {
        var fiveK = PlanFor(5, TimeSpan.FromMinutes(25));
        var marathon = PlanFor(42.195, TimeSpan.FromHours(4));

        ShareOf(fiveK, PaceZone.Interval).ShouldBeGreaterThan(ShareOf(marathon, PaceZone.Interval));
        ShareOf(marathon, PaceZone.Tempo).ShouldBeGreaterThan(ShareOf(fiveK, PaceZone.Tempo));
    }

    [Fact]
    public void A_5K_plan_sharpens_with_400s_in_its_peak()
    {
        var plan = PlanFor(5, TimeSpan.FromMinutes(25), new DateOnly(2027, 1, 10));

        plan.Weeks.Where(w => w.Phase == TrainingPhase.Peak).SelectMany(w => w.Sessions)
            .ShouldContain(s => s.Type == SessionType.Intervals && s.Detail.Contains("400 m", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(21.0975, 120)]
    [InlineData(42.195, 240)]
    public void Half_and_full_marathons_use_cruise_intervals(double km, int goalMinutes) =>
        Sessions(PlanFor(km, TimeSpan.FromMinutes(goalMinutes))).ShouldContain(s => s.Type == SessionType.CruiseIntervals);

    [Fact]
    public void A_5K_plan_has_no_cruise_intervals_or_back_to_backs()
    {
        var sessions = Sessions(PlanFor(5, TimeSpan.FromMinutes(25)));

        sessions.ShouldNotContain(s => s.Type == SessionType.CruiseIntervals);
        sessions.ShouldNotContain(s => s.Type == SessionType.MediumLongRun);
    }

    [Theory]
    [InlineData(56, 6)]
    [InlineData(90, 11)]
    public void Ultras_get_back_to_back_weekends_and_long_hills(double km, int goalHours)
    {
        var plan = PlanFor(km, TimeSpan.FromHours(goalHours), new DateOnly(2027, 6, 13));

        var backToBacks = plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Type == SessionType.MediumLongRun).ToList();
        backToBacks.ShouldNotBeEmpty();
        backToBacks.ShouldAllBe(s => s.Date.DayOfWeek == DayOfWeek.Saturday);
        Sessions(plan).ShouldContain(s => s.Title == "Long hill repeats");
    }

    [Fact]
    public void Back_to_backs_skip_cutback_weeks()
    {
        var plan = PlanFor(90, TimeSpan.FromHours(11), new DateOnly(2027, 6, 13));

        plan.Weeks.Where(w => w.IsCutback).SelectMany(w => w.Sessions).ShouldNotContain(s => s.Type == SessionType.MediumLongRun);
    }

    [Fact]
    public void A_long_ultra_plans_further_ahead_than_a_shorter_ultra()
    {
        var twoOceans = PlanFor(56, TimeSpan.FromHours(6), new DateOnly(2027, 9, 26));
        var comrades = PlanFor(90, TimeSpan.FromHours(11), new DateOnly(2027, 9, 26));

        twoOceans.Weeks.Count.ShouldBe(20);
        comrades.Weeks.Count.ShouldBe(24);
    }

    [Fact]
    public void Ultra_long_runs_go_beyond_marathon_long_runs_but_stay_capped()
    {
        var comrades = PlanFor(90, TimeSpan.FromHours(9), new DateOnly(2027, 6, 13));
        var marathon = PlanFor(42.195, TimeSpan.FromHours(3.5), new DateOnly(2027, 6, 13));

        double Longest(TrainingPlan p) => Sessions(p).Where(s => s.Type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace).Max(s => s.DistanceKm);
        Longest(comrades).ShouldBeGreaterThan(Longest(marathon));
        Longest(comrades).ShouldBeLessThanOrEqualTo(45);
        Longest(marathon).ShouldBeLessThanOrEqualTo(32);
    }

    [Fact]
    public void Ultra_sessions_talk_about_race_pace_and_fuelling()
    {
        var plan = PlanFor(90, TimeSpan.FromHours(11), new DateOnly(2027, 6, 13));

        Sessions(plan).Where(s => s.Type == SessionType.LongRun).ShouldAllBe(s => s.Detail.Contains("eat", StringComparison.Ordinal));
        plan.Weeks[^1].Sessions[^1].Detail.ShouldContain("walk the climbs");
    }
}

public sealed class DistanceSpecificTrainingV2Tests : DistanceSpecificTrainingTests
{
    protected override int Version => TrainingPlanGenerator.ShapedVersion;
}

public sealed class DistanceSpecificTrainingV3Tests : DistanceSpecificTrainingTests
{
    protected override int Version => TrainingPlanGenerator.LatestVersion;
}
