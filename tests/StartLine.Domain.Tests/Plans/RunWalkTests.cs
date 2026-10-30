using System.Text.Json;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>
/// Galloway-style run/walk (<see cref="RunWalkRules"/>): when Auto turns it on, the ratio bands, which sessions carry it,
/// and that plans before version 3 never change.
/// </summary>
public sealed class RunWalkTests
{
    private static readonly DateOnly Today = new(2026, 11, 2);
    private static readonly DayOfWeek[] FiveDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static readonly SessionType[] RunWalkSessions =
        [SessionType.LongRun, SessionType.LongRunFastFinish, SessionType.LongRunRacePace, SessionType.MediumLongRun, SessionType.Race];

    private static TrainingPlan Plan(
        Distance distance, TimeSpan goal, RunWalkMode runWalk = RunWalkMode.Auto, int version = TrainingPlanGenerator.LatestVersion) =>
        TrainingPlanGenerator.Generate(new PlanParameters(
            distance, goal, Today.AddDays(7 * 24), Today, FiveDays, DayOfWeek.Sunday, 50,
            GeneratorVersion: version, RunWalk: runWalk));

    private static List<PlannedSession> Sessions(TrainingPlan plan) => [.. plan.Weeks.SelectMany(w => w.Sessions)];

    private static bool UsesRunWalk(TrainingPlan plan) => Sessions(plan).Any(s => s.RunWalk is not null);

    [Theory]
    [InlineData(90, 10, 0, true)]    // Comrades in 10 hours: on
    [InlineData(90, 9, 59, false)]   // a minute quicker: off
    [InlineData(56, 10, 0, true)]    // a shorter ultra at 10 hours counts too
    [InlineData(56, 6, 0, false)]
    [InlineData(42.195, 5, 30, true)] // a 5:30 marathon: on
    [InlineData(42.195, 5, 29, false)]
    [InlineData(42.195, 6, 30, true)]
    [InlineData(21.0975, 3, 30, false)] // Auto never turns it on for a half, however slow
    [InlineData(10, 1, 45, false)]
    public void Auto_turns_run_walk_on_only_for_long_slow_ultras_and_marathons(double km, int hours, int minutes, bool on)
    {
        UsesRunWalk(Plan(Distance.FromKilometres(km), new TimeSpan(hours, minutes, 0))).ShouldBe(on);
    }

    [Fact]
    public void On_and_off_are_the_runners_choice_for_any_distance()
    {
        UsesRunWalk(Plan(Distance.TenK, TimeSpan.FromMinutes(55), RunWalkMode.On)).ShouldBeTrue();
        UsesRunWalk(Plan(Distance.HalfMarathon, TimeSpan.FromHours(2), RunWalkMode.On)).ShouldBeTrue();
        UsesRunWalk(Plan(Distance.Marathon, TimeSpan.FromHours(6), RunWalkMode.Off)).ShouldBeFalse();
        UsesRunWalk(Plan(Distance.FromKilometres(90), TimeSpan.FromHours(11), RunWalkMode.Off)).ShouldBeFalse();
    }

    [Theory]
    [InlineData(300, 480)] // 5:00/km: run 8 min
    [InlineData(389, 480)]
    [InlineData(390, 240)] // 6:30/km is no longer faster than 6:30: run 4 min
    [InlineData(449, 240)]
    [InlineData(450, 150)] // 7:30/km: run 2 min 30 s
    [InlineData(509, 150)]
    [InlineData(510, 60)]  // 8:30/km and slower: run 1 min
    [InlineData(600, 60)]
    public void The_ratio_follows_the_long_run_pace_in_galloway_bands(double secondsPerKm, int runSeconds)
    {
        RunWalkRules.For(Pace.FromSecondsPerKilometre(secondsPerKm)).ShouldBe(new RunWalkRatio(runSeconds, 30));
    }

    [Fact]
    public void A_plan_uses_the_ratio_of_its_own_long_run_pace()
    {
        var plan = Plan(Distance.Marathon, TimeSpan.FromHours(6));
        var expected = RunWalkRules.For(plan.Paces[PaceZone.LongRun].Midpoint);

        Sessions(plan).Where(s => s.RunWalk is not null).ShouldAllBe(s => s.RunWalk == expected);
    }

    [Fact]
    public void Only_long_runs_the_medium_long_run_and_race_day_get_run_walk()
    {
        var plan = Plan(Distance.FromKilometres(90), TimeSpan.FromHours(11));
        var sessions = Sessions(plan);

        // The ultra's back-to-back weekends are there, so the medium-long run is checked too.
        sessions.ShouldContain(s => s.Type == SessionType.MediumLongRun);
        sessions.Where(s => RunWalkSessions.Contains(s.Type)).ShouldAllBe(s => s.RunWalk != null);
        sessions.Where(s => !RunWalkSessions.Contains(s.Type)).ShouldAllBe(s => s.RunWalk == null);
        sessions.Where(s => s.RunWalk != null).ShouldAllBe(s => s.Detail.Contains("walk ", StringComparison.Ordinal));
    }

    [Fact]
    public void Run_walk_changes_no_distance_and_leaves_easy_and_hard_sessions_as_they_were()
    {
        var on = Sessions(Plan(Distance.Marathon, TimeSpan.FromHours(4.5), RunWalkMode.On));
        var off = Sessions(Plan(Distance.Marathon, TimeSpan.FromHours(4.5), RunWalkMode.Off));

        on.Select(s => (s.Date, s.Type, s.DistanceKm)).ShouldBe(off.Select(s => (s.Date, s.Type, s.DistanceKm)));
        on.Zip(off).Where(pair => !RunWalkSessions.Contains(pair.First.Type))
            .ShouldAllBe(pair => pair.First.Detail == pair.Second.Detail && pair.First.Title == pair.Second.Title);
    }

    [Fact]
    public void Race_day_says_to_walk_from_the_first_kilometre_and_that_the_goal_pace_includes_the_breaks()
    {
        var race = Sessions(Plan(Distance.Marathon, TimeSpan.FromHours(6))).Single(s => s.Type == SessionType.Race);

        race.Detail.ShouldContain("from the first kilometre, not when you get tired");
        race.Detail.ShouldContain("goal pace already includes them");
        race.Detail.ShouldContain(race.RunWalk!.Describe());
    }

    [Fact]
    public void The_ratio_reads_in_plain_words()
    {
        new RunWalkRatio(150, 30).Describe().ShouldBe("run 2 min 30 s, walk 30 s");
        new RunWalkRatio(480, 30).Describe().ShouldBe("run 8 min, walk 30 s");
    }

    [Theory]
    [InlineData(TrainingPlanGenerator.OriginalVersion)]
    [InlineData(TrainingPlanGenerator.ShapedVersion)]
    public void Plans_before_version_3_are_unchanged_whatever_is_asked(int version)
    {
        // A 6-hour marathon would be run/walk on Auto in version 3.
        var asBefore = Plan(Distance.Marathon, TimeSpan.FromHours(6), RunWalkMode.Auto, version);
        var on = Plan(Distance.Marathon, TimeSpan.FromHours(6), RunWalkMode.On, version);

        UsesRunWalk(asBefore).ShouldBeFalse();
        JsonSerializer.Serialize(on).ShouldBe(JsonSerializer.Serialize(asBefore));
        Sessions(asBefore).Where(s => s.Type == SessionType.LongRun)
            .ShouldAllBe(s => s.Detail.StartsWith("Steady and relaxed the whole way. Walk breaks are fine.", StringComparison.Ordinal));
    }

    [Fact]
    public void An_unknown_choice_is_refused()
    {
        Should.Throw<DomainException>(() => Plan(Distance.Marathon, TimeSpan.FromHours(4), (RunWalkMode)7));
    }
}
