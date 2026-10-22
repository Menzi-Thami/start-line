using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

public class TrainingPlanGeneratorTests
{
    // Every rule here holds for both generator versions: the subclass at the end runs them all again for version 2.
    protected virtual int Version => TrainingPlanGenerator.OriginalVersion;

    private TrainingPlan Generate(PlanParameters parameters) => TrainingPlanGenerator.Generate(parameters with { GeneratorVersion = Version });

    // A Thursday, so the plan should start the following Monday.
    private static readonly DateOnly Today = new(2026, 10, 8);

    private static PlanParameters Marathon(
        DateOnly? raceDate = null,
        int runsPerWeek = 5,
        DayOfWeek longRunDay = DayOfWeek.Sunday,
        double? currentWeeklyKm = 40,
        TimeSpan? goal = null,
        DayOfWeek[]? runDays = null) => new(
            Distance.Marathon,
            goal ?? TimeSpan.FromHours(4),
            raceDate ?? new DateOnly(2027, 2, 28),
            Today,
            runDays ?? TypicalDays(runsPerWeek, longRunDay),
            longRunDay,
            currentWeeklyKm);

    /// <summary>A common spread of run days, shifted so the long run lands on <paramref name="longRunDay"/>.</summary>
    private static DayOfWeek[] TypicalDays(int count, DayOfWeek longRunDay)
    {
        // Monday-based indices for a Sunday long run (6).
        int[] sundayBased = count switch
        {
            3 => [1, 3, 6],
            4 => [0, 1, 3, 6],
            5 => [1, 2, 3, 5, 6],
            6 => [0, 1, 2, 3, 5, 6],
            _ => [0, 1, 2, 3, 4, 5, 6],
        };
        var shift = ((int)longRunDay + 6) % 7 - 6;
        return [.. sundayBased.Select(i => (DayOfWeek)((((i + shift) % 7 + 7) % 7 + 1) % 7))];
    }

    private static IEnumerable<PlanWeek> TrainingWeeks(TrainingPlan plan) =>
        plan.Weeks.Where(w => w.Phase != TrainingPhase.RaceWeek);

    [Fact]
    public void Starts_on_the_next_Monday()
    {
        var plan = Generate(Marathon());

        plan.StartDate.ShouldBe(new DateOnly(2026, 10, 12));
        plan.Weeks[0].StartDate.ShouldBe(plan.StartDate);
    }

    [Fact]
    public void Starts_today_when_today_is_a_Monday()
    {
        var monday = new DateOnly(2026, 10, 12);
        var plan = Generate(Marathon() with { Today = monday });

        plan.StartDate.ShouldBe(monday);
    }

    [Fact]
    public void Ends_with_the_race_on_race_day()
    {
        var parameters = Marathon();
        var plan = Generate(parameters);

        var last = plan.Weeks[^1].Sessions[^1];
        last.Type.ShouldBe(SessionType.Race);
        last.Date.ShouldBe(parameters.RaceDate);
        last.DistanceKm.ShouldBe(42.2);
        plan.Weeks[^1].Phase.ShouldBe(TrainingPhase.RaceWeek);
    }

    [Fact]
    public void Nothing_is_scheduled_after_the_race()
    {
        var parameters = Marathon(raceDate: new DateOnly(2027, 2, 27)); // a Saturday
        var plan = Generate(parameters);

        plan.Weeks.SelectMany(w => w.Sessions).ShouldAllBe(s => s.Date <= parameters.RaceDate);
    }

    [Fact]
    public void Caps_the_plan_length_and_starts_later_for_a_far_off_race()
    {
        var plan = Generate(Marathon(raceDate: new DateOnly(2027, 9, 26)));

        plan.Weeks.Count.ShouldBe(20);
        plan.StartDate.ShouldBe(new DateOnly(2027, 9, 20).AddDays(-7 * 19));
        plan.Warnings.ShouldContain(w => w.Code == "starts-later");
    }

    [Fact]
    public void Warns_when_there_is_less_time_than_recommended()
    {
        var plan = Generate(Marathon(raceDate: new DateOnly(2026, 11, 29)));

        plan.Weeks.Count.ShouldBe(7);
        plan.Warnings.ShouldContain(w => w.Code == "short-plan");
    }

    [Fact]
    public void Warns_when_current_volume_is_too_low_to_build_safely()
    {
        var plan = Generate(Marathon(raceDate: new DateOnly(2027, 1, 3), currentWeeklyKm: 10));

        plan.Warnings.ShouldContain(w => w.Code == "low-volume");
    }

    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    public void Every_training_week_has_the_requested_number_of_runs(int runsPerWeek)
    {
        var plan = Generate(Marathon(runsPerWeek: runsPerWeek));

        TrainingWeeks(plan).ShouldAllBe(w => w.Sessions.Count == runsPerWeek);
    }

    [Theory]
    [InlineData(DayOfWeek.Saturday)]
    [InlineData(DayOfWeek.Sunday)]
    [InlineData(DayOfWeek.Wednesday)]
    public void Long_runs_land_on_the_chosen_day(DayOfWeek longRunDay)
    {
        var plan = Generate(Marathon(longRunDay: longRunDay));

        var longRuns = TrainingWeeks(plan).SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).ToList();
        longRuns.Count.ShouldBe(TrainingWeeks(plan).Count());
        longRuns.ShouldAllBe(s => s.Date.DayOfWeek == longRunDay);
    }

    [Fact]
    public void Never_schedules_two_runs_on_one_day_or_a_run_outside_its_week()
    {
        var plan = Generate(Marathon(runsPerWeek: 6));

        foreach (var week in plan.Weeks)
        {
            week.Sessions.Select(s => s.Date).ShouldBeUnique();
            week.Sessions.ShouldAllBe(s => s.Date >= week.StartDate && s.Date < week.StartDate.AddDays(7));
        }
    }

    [Fact]
    public void Hard_sessions_are_never_on_back_to_back_days()
    {
        var plan = Generate(Marathon(runsPerWeek: 6));
        PaceZone?[] hard = [PaceZone.Interval, PaceZone.Tempo, PaceZone.Race, PaceZone.LongRun];

        var hardDates = plan.Weeks.SelectMany(w => w.Sessions)
            .Where(s => hard.Contains(s.Zone) && s.Type != SessionType.Race)
            .Select(s => s.Date)
            .Order()
            .ToList();
        hardDates.Zip(hardDates.Skip(1)).ShouldAllBe(pair => pair.Second.DayNumber - pair.First.DayNumber > 1);
    }

    [Fact]
    public void Weekly_volume_builds_by_no_more_than_about_ten_percent()
    {
        var plan = Generate(Marathon());
        var building = plan.Weeks.Where(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak && !w.IsCutback).ToList();

        // A little headroom for distances being rounded to the nearest half kilometre.
        building.Zip(building.Skip(1)).ShouldAllBe(pair => pair.Second.PlannedKm <= pair.First.PlannedKm * 1.12);
    }

    [Fact]
    public void Cutback_weeks_drop_below_the_week_before()
    {
        var plan = Generate(Marathon());

        var cutbacks = plan.Weeks.Where(w => w.IsCutback).ToList();
        cutbacks.ShouldNotBeEmpty();
        cutbacks.ShouldAllBe(w => w.PlannedKm < plan.Weeks[w.Number - 2].PlannedKm);
    }

    [Fact]
    public void Volume_tapers_into_race_week()
    {
        var plan = Generate(Marathon());
        var peak = TrainingWeeks(plan).Where(w => w.Phase != TrainingPhase.Taper).Max(w => w.PlannedKm);

        var taper = plan.Weeks.Where(w => w.Phase == TrainingPhase.Taper).Select(w => w.PlannedKm).ToList();
        taper.Count.ShouldBe(2);
        taper[0].ShouldBeLessThan(peak);
        taper[1].ShouldBeLessThan(taper[0]);

        var raceWeekWithoutRace = plan.Weeks[^1].Sessions.Where(s => s.Type != SessionType.Race).Sum(s => s.DistanceKm);
        raceWeekWithoutRace.ShouldBeLessThan(taper[1]);
    }

    [Fact]
    public void Long_runs_never_exceed_the_distance_cap()
    {
        var plan = Generate(Marathon(currentWeeklyKm: 90));

        plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).ShouldAllBe(s => s.DistanceKm <= 32);
    }

    [Fact]
    public void Slower_runners_get_long_runs_capped_by_time_instead()
    {
        var plan = Generate(Marathon(goal: TimeSpan.FromHours(6), currentWeeklyKm: 60));
        var longPace = plan.Paces[PaceZone.LongRun].Midpoint;

        var longest = plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Zone == PaceZone.LongRun).Max(s => s.DistanceKm);
        longPace.TimeFor(Distance.FromKilometres(longest)).ShouldBeLessThanOrEqualTo(TimeSpan.FromMinutes(195 + 3));
        longest.ShouldBeLessThan(32);
    }

    [Fact]
    public void The_same_inputs_always_give_the_same_plan()
    {
        var first = Generate(Marathon());
        var second = Generate(Marathon());

        first.Weeks.SelectMany(w => w.Sessions).SequenceEqual(second.Weeks.SelectMany(w => w.Sessions)).ShouldBeTrue();
    }

    [Theory]
    [InlineData(5, 25)]
    [InlineData(10, 50)]
    [InlineData(21.0975, 110)]
    [InlineData(56, 360)]
    [InlineData(100, 720)]
    public void Generates_a_sensible_plan_for_every_distance(double km, double goalMinutes)
    {
        var raceDate = new DateOnly(2027, 1, 31);
        var plan = Generate(new PlanParameters(
            Distance.FromKilometres(km), TimeSpan.FromMinutes(goalMinutes), raceDate, Today, TypicalDays(4, DayOfWeek.Sunday), DayOfWeek.Sunday, null));

        plan.Weeks.ShouldNotBeEmpty();
        plan.Weeks.SelectMany(w => w.Sessions).ShouldAllBe(s => s.DistanceKm > 0 && s.Title.Length > 0 && s.Purpose.Length > 0);
        plan.Weeks[^1].Sessions[^1].Date.ShouldBe(raceDate);
    }

    [Fact]
    public void Week_one_opens_with_an_easy_run_because_nothing_came_before_it()
    {
        // Six days with a Sunday long run: Monday is normally the recovery from Sunday.
        var plan = Generate(Marathon(runsPerWeek: 6));

        plan.Weeks[0].Sessions[0].Type.ShouldBe(SessionType.Easy);
        plan.Weeks[1].Sessions[0].Type.ShouldBe(SessionType.Recovery);
    }

    [Fact]
    public void An_easy_day_straight_after_a_hard_day_is_a_recovery_run()
    {
        // Tuesday intervals, Wednesday sandwiched before Thursday's session.
        var plan = Generate(Marathon(runsPerWeek: 5));

        TrainingWeeks(plan).Where(w => !w.IsCutback && w.Phase != TrainingPhase.Taper)
            .ShouldAllBe(w => w.Sessions.Single(s => s.Date.DayOfWeek == DayOfWeek.Wednesday).Type == SessionType.Recovery);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(4)]
    public void Low_frequency_plans_keep_build_long_runs_easy_and_alternate_peak_rehearsals(int runsPerWeek)
    {
        var plan = Generate(Marathon(runsPerWeek: runsPerWeek));
        Func<PlanWeek, SessionType> longRunOf = w => w.Sessions.Single(s => s.Zone == PaceZone.LongRun).Type;

        plan.Weeks.Where(w => w.Phase == TrainingPhase.Build).ShouldAllBe(w => longRunOf(w) == SessionType.LongRun);
        var peak = plan.Weeks.Where(w => w.Phase == TrainingPhase.Peak && !w.IsCutback).Select(longRunOf).ToList();
        peak.ShouldContain(SessionType.LongRunRacePace);
        peak.ShouldContain(SessionType.LongRun);
    }

    [Fact]
    public void Five_day_plans_get_harder_long_runs_through_build()
    {
        var plan = Generate(Marathon(runsPerWeek: 5));

        plan.Weeks.Where(w => w.Phase == TrainingPhase.Build).SelectMany(w => w.Sessions)
            .ShouldContain(s => s.Type == SessionType.LongRunFastFinish);
    }

    [Fact]
    public void Race_week_is_light_with_one_sharpener()
    {
        var plan = Generate(Marathon(runsPerWeek: 4) with { RaceDistance = Distance.HalfMarathon, GoalTime = TimeSpan.FromHours(2) });
        var raceWeek = plan.Weeks[^1].Sessions;

        raceWeek.Count(s => s.Title == "Race-pace sharpener").ShouldBe(1);
        raceWeek.Where(s => s.Type != SessionType.Race).ShouldAllBe(s => s.DistanceKm <= 6.5);
    }

    [Fact]
    public void A_run_the_day_before_the_race_is_a_shakeout()
    {
        // Six runs with a Saturday long run puts a run on Friday, the day before a Saturday race.
        var parameters = Marathon(runsPerWeek: 6, longRunDay: DayOfWeek.Saturday, raceDate: new DateOnly(2027, 2, 27));
        var plan = Generate(parameters);

        plan.Weeks[^1].Sessions.Single(s => s.Date == parameters.RaceDate.AddDays(-1)).Type.ShouldBe(SessionType.Shakeout);
    }

    [Fact]
    public void Runs_only_on_the_days_the_runner_picked()
    {
        DayOfWeek[] picked = [DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday, DayOfWeek.Saturday];
        var plan = Generate(Marathon(runDays: picked, longRunDay: DayOfWeek.Saturday));

        TrainingWeeks(plan).SelectMany(w => w.Sessions).ShouldAllBe(s => picked.Contains(s.Date.DayOfWeek));
    }

    [Fact]
    public void Hard_days_are_spread_out_around_an_unusual_choice_of_days()
    {
        // Long run Saturday; the only days not touching it or each other are Monday and Wednesday.
        DayOfWeek[] picked = [DayOfWeek.Monday, DayOfWeek.Wednesday, DayOfWeek.Friday, DayOfWeek.Saturday];
        var plan = Generate(Marathon(runDays: picked, longRunDay: DayOfWeek.Saturday));
        var buildWeek = plan.Weeks.First(w => w.Phase == TrainingPhase.Build && !w.IsCutback);

        var hard = buildWeek.Sessions.Where(s => s.Zone is PaceZone.Interval or PaceZone.Tempo).Select(s => s.Date.DayOfWeek).ToList();
        hard.ShouldBe([DayOfWeek.Monday, DayOfWeek.Wednesday]);
        buildWeek.Sessions.Single(s => s.Date.DayOfWeek == DayOfWeek.Friday).Zone.ShouldBe(PaceZone.Easy);
    }

    [Fact]
    public void Warns_when_the_chosen_days_force_hard_runs_back_to_back()
    {
        DayOfWeek[] bunched = [DayOfWeek.Saturday, DayOfWeek.Sunday, DayOfWeek.Monday];
        var plan = Generate(Marathon(runDays: bunched));

        plan.Warnings.ShouldContain(w => w.Code == "back-to-back");
    }

    [Fact]
    public void Well_spread_days_get_no_back_to_back_warning() =>
        Generate(Marathon()).Warnings.ShouldNotContain(w => w.Code == "back-to-back");

    [Fact]
    public void A_full_plan_uses_the_whole_range_of_sessions()
    {
        var plan = Generate(Marathon(runsPerWeek: 5, raceDate: new DateOnly(2027, 3, 21)));

        var types = plan.Weeks.SelectMany(w => w.Sessions).Select(s => s.Type).ToHashSet();
        SessionType[] expected =
        [
            SessionType.Easy, SessionType.Recovery, SessionType.EasyWithStrides, SessionType.Hills, SessionType.Fartlek,
            SessionType.Intervals, SessionType.Tempo, SessionType.ProgressionRun, SessionType.RacePace,
            SessionType.LongRun, SessionType.LongRunFastFinish, SessionType.LongRunRacePace, SessionType.Shakeout, SessionType.Race,
        ];
        expected.Where(t => !types.Contains(t)).ShouldBeEmpty();
    }

    [Fact]
    public void Quality_sessions_vary_from_week_to_week()
    {
        var plan = Generate(Marathon(runsPerWeek: 4));
        var build = plan.Weeks.Where(w => w.Phase == TrainingPhase.Build && !w.IsCutback).ToList();

        var firstSessions = build.Select(w => w.Sessions.First(s => s.Zone is PaceZone.Interval or PaceZone.Tempo).Type).Distinct();
        firstSessions.Count().ShouldBeGreaterThan(1);
    }

    [Fact]
    public void Rejects_fewer_than_three_run_days() =>
        Should.Throw<DomainException>(() => Generate(
            Marathon(runDays: [DayOfWeek.Tuesday, DayOfWeek.Sunday])));

    [Fact]
    public void Repeated_days_count_once() =>
        Should.Throw<DomainException>(() => Generate(
            Marathon(runDays: [DayOfWeek.Sunday, DayOfWeek.Sunday, DayOfWeek.Tuesday])));

    [Fact]
    public void Rejects_a_long_run_day_that_is_not_a_run_day() =>
        Should.Throw<DomainException>(() => Generate(
            Marathon(runDays: [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday], longRunDay: DayOfWeek.Sunday)));

    [Fact]
    public void Rejects_a_race_in_the_past() =>
        Should.Throw<DomainException>(() => Generate(Marathon(raceDate: Today.AddDays(-1))));

    [Fact]
    public void Rejects_a_race_less_than_two_weeks_out() =>
        Should.Throw<DomainException>(() => Generate(Marathon(raceDate: Today.AddDays(5))));
}

public sealed class TrainingPlanGeneratorV2Tests : TrainingPlanGeneratorTests
{
    protected override int Version => TrainingPlanGenerator.LatestVersion;
}
