using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

public class ExperienceAndStrengthTests
{
    // Every rule here holds for both generator versions: the subclass at the end runs them all again for version 2.
    protected virtual int Version => TrainingPlanGenerator.OriginalVersion;

    private TrainingPlan Generate(PlanParameters parameters) => TrainingPlanGenerator.Generate(parameters with { GeneratorVersion = Version });

    private static readonly DateOnly Today = new(2026, 10, 8);

    private static readonly DayOfWeek[] FourDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private TrainingPlan Half(Experience experience = Experience.Regular, DayOfWeek[]? strengthDays = null, double? currentKm = null) =>
        Generate(new PlanParameters(
            Distance.HalfMarathon, TimeSpan.FromHours(2), new DateOnly(2027, 1, 24), Today,
            FourDays, DayOfWeek.Sunday, currentKm, experience, strengthDays));

    private static double PeakKm(TrainingPlan plan) =>
        plan.Weeks.Where(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak).Max(w => w.PlannedKm);

    [Fact]
    public void Experienced_runners_peak_higher_than_new_runners()
    {
        // Same starting point, so the only difference is the experience level.
        var newRunner = Half(Experience.New, currentKm: 30);
        var experienced = Half(Experience.Experienced, currentKm: 30);

        PeakKm(experienced).ShouldBeGreaterThan(PeakKm(newRunner));
    }

    [Fact]
    public void New_runners_spend_longer_in_base()
    {
        int BaseWeeks(TrainingPlan p) => p.Weeks.Count(w => w.Phase == TrainingPhase.Base);

        BaseWeeks(Half(Experience.New)).ShouldBeGreaterThan(BaseWeeks(Half(Experience.Regular)));
    }

    [Fact]
    public void Strength_sessions_land_on_the_chosen_days_and_add_no_distance()
    {
        var plan = Half(strengthDays: [DayOfWeek.Monday, DayOfWeek.Thursday]);

        var strength = plan.Weeks.Where(w => w.Phase != TrainingPhase.RaceWeek)
            .SelectMany(w => w.Sessions).Where(s => s.Type == SessionType.Strength).ToList();
        strength.Count.ShouldBe(2 * (plan.Weeks.Count - 1));
        strength.ShouldAllBe(s => s.DistanceKm == 0 && s.Zone == null);
        strength.ShouldAllBe(s => s.Date.DayOfWeek == DayOfWeek.Monday || s.Date.DayOfWeek == DayOfWeek.Thursday);
    }

    [Fact]
    public void Strength_on_a_run_day_comes_after_the_run()
    {
        var plan = Half(strengthDays: [DayOfWeek.Thursday]);

        var day = plan.Weeks[1].Sessions.Single(s => s.Type == SessionType.Strength).Date;
        day.DayOfWeek.ShouldBe(DayOfWeek.Thursday);
        var sessions = plan.Weeks[1].Sessions.Where(s => s.Date == day).ToList();
        sessions.Count.ShouldBe(2);
        sessions[^1].Type.ShouldBe(SessionType.Strength);
    }

    // Regression: an early version 3 moved strength off hard days and the eve of the long run, trying the next day first,
    // so a runner who picked Tuesday saw it on Wednesday ("coming up" on the day they meant to do it). It stays put now.
    [Fact]
    public void Strength_stays_on_the_chosen_day_even_beside_a_hard_run_or_on_the_eve_of_the_long_run()
    {
        var plan = Half(strengthDays: [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday]);

        foreach (var week in plan.Weeks.Where(w => w.Phase != TrainingPhase.RaceWeek))
        {
            week.Sessions.Where(s => s.Type == SessionType.Strength).Select(s => s.Date.DayOfWeek)
                .ShouldBe([DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday]);
        }
    }

    [Fact]
    public void A_hard_run_and_strength_on_the_same_day_share_it_with_the_run_first()
    {
        var plan = Half(strengthDays: [DayOfWeek.Tuesday]);
        var hardTypes = new[] { SessionType.Hills, SessionType.Fartlek, SessionType.Intervals, SessionType.Tempo, SessionType.CruiseIntervals, SessionType.ProgressionRun, SessionType.RacePace };

        var shared = plan.Weeks.Where(w => w.Phase != TrainingPhase.RaceWeek)
            .Select(w => w.Sessions.Where(s => s.Date.DayOfWeek == DayOfWeek.Tuesday).ToList())
            .Where(day => day.Any(s => hardTypes.Contains(s.Type))).ToList();
        shared.ShouldNotBeEmpty();
        shared.ShouldAllBe(day => day.Count == 2 && day[1].Type == SessionType.Strength);
    }

    [Fact]
    public void A_replanned_plan_keeps_strength_on_the_chosen_day()
    {
        var plan = Generate(new PlanParameters(
            Distance.HalfMarathon, TimeSpan.FromHours(2), new DateOnly(2027, 1, 24), Today,
            FourDays, DayOfWeek.Sunday, null, Experience.Regular, [DayOfWeek.Tuesday, DayOfWeek.Saturday],
            Replan: new PlanReplan(new DateOnly(2026, 11, 19), Setback.MissedTraining)));

        var strength = plan.Weeks.Where(w => w.Phase != TrainingPhase.RaceWeek).SelectMany(w => w.Sessions)
            .Where(s => s.Type == SessionType.Strength).ToList();
        strength.ShouldNotBeEmpty();
        strength.ShouldAllBe(s => s.Date.DayOfWeek == DayOfWeek.Tuesday || s.Date.DayOfWeek == DayOfWeek.Saturday);
    }

    [Fact]
    public void Strength_is_skipped_on_the_long_run_day_and_in_race_week()
    {
        var plan = Half(strengthDays: [DayOfWeek.Sunday, DayOfWeek.Wednesday]);

        plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Type == SessionType.Strength)
            .ShouldAllBe(s => s.Date.DayOfWeek == DayOfWeek.Wednesday);
        plan.Weeks[^1].Sessions.ShouldNotContain(s => s.Type == SessionType.Strength);
    }

    [Fact]
    public void Easier_weeks_get_lighter_strength_work()
    {
        var plan = Half(strengthDays: [DayOfWeek.Monday]);

        plan.Weeks.Where(w => w.IsCutback || w.Phase == TrainingPhase.Taper).SelectMany(w => w.Sessions)
            .Where(s => s.Type == SessionType.Strength)
            .ShouldAllBe(s => s.Title == "Mobility + light strength");
    }

    private static List<PlannedSession> StrengthSessions(TrainingPlan plan) =>
        [.. plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Type == SessionType.Strength)];

    [Fact]
    public void Every_strength_session_lists_its_exercises_with_sets_and_reps()
    {
        var plan = Half(strengthDays: [DayOfWeek.Monday]);

        StrengthSessions(plan).ShouldNotBeEmpty();
        StrengthSessions(plan).ShouldAllBe(s => s.Exercises != null && s.Exercises.Count >= 4
            && s.Exercises.All(e => e.Sets > 0 && e.Reps > 0));
        plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Type != SessionType.Strength).ShouldAllBe(s => s.Exercises == null);
    }

    [Fact]
    public void Build_and_peak_strength_trains_one_leg_at_a_time()
    {
        var plan = Half(strengthDays: [DayOfWeek.Monday]);

        var hard = plan.Weeks.Where(w => w.Phase is TrainingPhase.Build or TrainingPhase.Peak && !w.IsCutback)
            .SelectMany(w => w.Sessions).Where(s => s.Type == SessionType.Strength).ToList();
        hard.ShouldNotBeEmpty();
        hard.ShouldAllBe(s => s.Exercises!.Any(e => e.Exercise == Exercise.BulgarianSplitSquat)
            && s.Exercises!.Any(e => e.Exercise == Exercise.RomanianDeadlift));
    }

    [Fact]
    public void Easier_weeks_keep_strength_to_two_sets_and_no_jumping()
    {
        var plan = Half(strengthDays: [DayOfWeek.Monday]);

        plan.Weeks.Where(w => w.IsCutback || w.Phase == TrainingPhase.Taper).SelectMany(w => w.Sessions)
            .Where(s => s.Type == SessionType.Strength)
            .ShouldAllBe(s => s.Exercises!.All(e => e.Sets <= 2 && e.Exercise != Exercise.SquatJump));
    }

    [Fact]
    public void The_strength_detail_is_a_short_intro_and_each_exercise_says_what_to_do_in_words()
    {
        var session = StrengthSessions(Half(strengthDays: [DayOfWeek.Monday]))[0];

        // The list is shown as a list; the detail mustn't repeat it as a paragraph.
        session.Detail.ShouldStartWith("About 30 min.");
        session.Detail.ShouldNotContain("squats");
        session.Exercises!.Select(e => e.Summary).ShouldBe(
        [
            "3 × 10 squats", "3 × 10 Romanian deadlifts", "3 × 8 reverse lunges each leg",
            "3 × 12 glute bridges", "3 × 15 calf raises", "3 × 30 s plank",
        ]);
    }

    [Fact]
    public void Explosive_work_comes_first_while_the_legs_are_fresh()
    {
        var plan = Half(strengthDays: [DayOfWeek.Monday]);

        plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Exercises?.Any(e => e.Exercise == Exercise.SquatJump) == true)
            .ShouldAllBe(s => s.Exercises![0].Exercise == Exercise.SquatJump);
    }

    [Theory]
    [MemberData(nameof(EveryExercise))]
    public void Every_exercise_has_words_for_every_kind_of_set(Exercise exercise)
    {
        foreach (var unit in Enum.GetValues<RepUnit>())
        {
            new StrengthExercise(exercise, 3, 8, unit).Summary.ShouldStartWith("3 × 8");
        }
    }

    public static TheoryData<Exercise> EveryExercise() => new(Enum.GetValues<Exercise>());

    [Fact]
    public void Rejects_more_than_three_strength_days() =>
        Should.Throw<DomainException>(() => Half(strengthDays: [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday]));
}

public sealed class ExperienceAndStrengthV2Tests : ExperienceAndStrengthTests
{
    protected override int Version => TrainingPlanGenerator.ShapedVersion;
}

public sealed class ExperienceAndStrengthV3Tests : ExperienceAndStrengthTests
{
    protected override int Version => TrainingPlanGenerator.LatestVersion;
}
