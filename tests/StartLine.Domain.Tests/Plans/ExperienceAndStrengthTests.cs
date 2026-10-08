using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

public sealed class ExperienceAndStrengthTests
{
    private static readonly DateOnly Today = new(2026, 10, 8);

    private static readonly DayOfWeek[] FourDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static TrainingPlan Half(Experience experience = Experience.Regular, DayOfWeek[]? strengthDays = null, double? currentKm = null) =>
        TrainingPlanGenerator.Generate(new PlanParameters(
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
        strength.ShouldAllBe(s => (s.Date.DayOfWeek == DayOfWeek.Monday || s.Date.DayOfWeek == DayOfWeek.Thursday)
            && s.DistanceKm == 0 && s.Zone == null);
    }

    [Fact]
    public void Strength_on_a_run_day_comes_after_the_run()
    {
        var plan = Half(strengthDays: [DayOfWeek.Thursday]);

        var thursday = plan.Weeks[1].Sessions.Where(s => s.Date.DayOfWeek == DayOfWeek.Thursday).ToList();
        thursday.Count.ShouldBe(2);
        thursday[^1].Type.ShouldBe(SessionType.Strength);
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

    [Fact]
    public void Rejects_more_than_three_strength_days() =>
        Should.Throw<DomainException>(() => Half(strengthDays: [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday]));
}
