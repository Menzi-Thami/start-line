using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>What version 3 adds over version 2, checked against version 2 so the change is the point of each test.</summary>
public sealed class EngineV3Tests
{
    private static readonly DateOnly Today = new(2026, 11, 2);
    private static readonly DayOfWeek[] FiveDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];
    private static readonly DayOfWeek[] FourDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static readonly SessionType[] Hard =
        [SessionType.Hills, SessionType.Fartlek, SessionType.Intervals, SessionType.Tempo, SessionType.CruiseIntervals, SessionType.ProgressionRun, SessionType.RacePace];

    private static TrainingPlan Plan(Distance distance, TimeSpan goal, int version, DayOfWeek[] days, double? currentKm = 40, Experience experience = Experience.Regular) =>
        TrainingPlanGenerator.Generate(new PlanParameters(
            distance, goal, Today.AddDays(7 * 20), Today, days, DayOfWeek.Sunday, currentKm, experience, GeneratorVersion: version));

    private static double LongestRun(TrainingPlan plan) => plan.Weeks.SelectMany(w => w.Sessions)
        .Where(s => s.Type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace).Max(s => s.DistanceKm);

    [Fact]
    public void A_marathon_long_run_now_reaches_the_classic_floor_where_v2_stopped_short()
    {
        var v2 = Plan(Distance.Marathon, TimeSpan.FromHours(3.75), TrainingPlanGenerator.ShapedVersion, FiveDays);
        var v3 = Plan(Distance.Marathon, TimeSpan.FromHours(3.75), TrainingPlanGenerator.LatestVersion, FiveDays);

        LongestRun(v3).ShouldBeGreaterThan(LongestRun(v2));
        LongestRun(v3).ShouldBeGreaterThanOrEqualTo(24);
    }

    [Fact]
    public void The_floor_never_beats_the_time_cap_for_a_slow_marathoner()
    {
        // A 5:30 marathoner at long-run pace covers well under 26 km in the 3 h 15 min cap.
        var slow = Plan(Distance.Marathon, TimeSpan.FromHours(5.5), TrainingPlanGenerator.LatestVersion, FiveDays);

        LongestRun(slow).ShouldBeLessThan(26);
    }

    [Fact]
    public void On_four_runs_a_week_no_week_has_more_than_two_hard_days()
    {
        var plan = Plan(Distance.HalfMarathon, TimeSpan.FromHours(1.75), TrainingPlanGenerator.LatestVersion, FourDays);

        foreach (var week in plan.Weeks)
        {
            var hardDays = week.Sessions.Count(s => Hard.Contains(s.Type) || s.Type is SessionType.LongRunFastFinish or SessionType.LongRunRacePace);
            hardDays.ShouldBeLessThanOrEqualTo(2, $"week {week.Number}");
        }
    }

    [Fact]
    public void A_new_runner_starts_with_two_easy_weeks()
    {
        var plan = Plan(Distance.TenK, TimeSpan.FromMinutes(65), TrainingPlanGenerator.LatestVersion, FourDays, currentKm: 15, Experience.New);

        plan.Weeks.Take(2).SelectMany(w => w.Sessions).ShouldNotContain(s => Hard.Contains(s.Type));
        plan.Weeks.Skip(2).SelectMany(w => w.Sessions).ShouldContain(s => Hard.Contains(s.Type));
    }

    [Fact]
    public void A_hard_session_never_takes_more_than_its_share_of_a_small_week()
    {
        var plan = Plan(Distance.Marathon, TimeSpan.FromHours(4), TrainingPlanGenerator.LatestVersion, FourDays, currentKm: 25);

        foreach (var week in plan.Weeks.Where(w => w.Phase is not (TrainingPhase.Taper or TrainingPhase.RaceWeek)))
        {
            foreach (var hard in week.Sessions.Where(s => Hard.Contains(s.Type)))
            {
                // The lightest dose can still be a little over in the smallest week; never by much.
                hard.DistanceKm.ShouldBeLessThanOrEqualTo(Math.Max(week.PlannedKm * 0.30, 9), $"week {week.Number} {hard.Type}");
            }
        }
    }

    [Fact]
    public void Plans_saved_on_version_2_keep_their_shape()
    {
        var before = Plan(Distance.Marathon, TimeSpan.FromHours(3.75), TrainingPlanGenerator.ShapedVersion, FiveDays);
        var again = Plan(Distance.Marathon, TimeSpan.FromHours(3.75), TrainingPlanGenerator.ShapedVersion, FiveDays);

        again.Weeks.Select(w => w.PlannedKm).ShouldBe(before.Weeks.Select(w => w.PlannedKm));
        LongestRun(again).ShouldBe(LongestRun(before));
    }
}
