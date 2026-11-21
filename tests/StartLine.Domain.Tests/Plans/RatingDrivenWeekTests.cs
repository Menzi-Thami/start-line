using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>
/// The rest of this week, checked from what the runner reported after rating a run (<c>reportedOnly</c>): their effort
/// against what each kind of run should feel, pain, and runs they said they cut short, swapped or skipped. A day without a
/// check-in is never treated as missed in this mode, so an unrated Strava run can't trigger anything.
/// </summary>
public sealed class RatingDrivenWeekTests
{
    // Wednesday 28 October: Monday and Tuesday are behind, Friday and Sunday still to come.
    private static readonly DateOnly Today = new(2026, 10, 28);
    private static readonly Guid PlanId = Guid.NewGuid();

    private static TrainingPlan Plan() => TrainingPlanGenerator.Generate(new PlanParameters(Distance.TenK,
        TimeSpan.FromMinutes(52), new DateOnly(2026, 12, 20), new DateOnly(2026, 10, 19),
        [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday, DayOfWeek.Sunday], DayOfWeek.Sunday, 40,
        StrengthDays: [DayOfWeek.Thursday], GeneratorVersion: 2));

    private static IReadOnlyList<PlannedSession> Runs(TrainingPlan plan, Func<DateOnly, bool> when) =>
        [.. plan.Weeks.SelectMany(w => w.Sessions).Where(s => when(s.Date) && SessionCheckIn.IsCheckable(s.Type))];

    private static SessionCheckIn Rated(PlannedSession session, int effort, CheckInStatus status = CheckInStatus.Done, PainLevel pain = PainLevel.None) =>
        SessionCheckIn.Create(PlanId, session.Date, session.Type, new CheckInAnswers(status, status == CheckInStatus.Skipped ? null : effort, pain,
            pain == PainLevel.None ? null : BodyArea.Calf));

    private static int MuchHarder(SessionType type) => Math.Min(10, ExpectedEffort.For(type)!.Value.High + WeeklyCoach.FeltHarderBy);

    [Fact]
    public void Two_runs_that_felt_much_harder_than_they_should_ease_the_rest_of_the_week()
    {
        var plan = Plan();
        var past = Runs(plan, d => d >= new DateOnly(2026, 10, 26) && d < Today);
        past.Count.ShouldBeGreaterThanOrEqualTo(2);
        var entries = past.Take(2).Select(s => Rated(s, MuchHarder(s.Type))).ToList();

        var changes = RemainingWeek.Preview(plan, entries, [], Today, reportedOnly: true);

        changes.ShouldNotBeEmpty();
        changes.ShouldAllBe(c => c.Date > Today && c.EasyKm <= c.OriginalKm);
        var adjusted = RemainingWeek.Apply(plan, changes);
        adjusted.Weeks.SelectMany(w => w.Sessions).Where(s => changes.Any(c => c.Date == s.Date))
            .ShouldAllBe(s => !ExpectedEffort.IsHard(s.Type));
        // Only this week: the next week and the race are untouched.
        changes.ShouldAllBe(c => c.Date < Today.AddDays(5));
    }

    [Fact]
    public void One_hard_feeling_run_alone_changes_nothing()
    {
        var plan = Plan();
        var first = Runs(plan, d => d >= new DateOnly(2026, 10, 26) && d < Today)[0];
        RemainingWeek.Preview(plan, [Rated(first, MuchHarder(first.Type))], [], Today, reportedOnly: true).ShouldBeEmpty();
    }

    [Fact]
    public void Effort_is_judged_against_the_kind_of_run_so_hard_sessions_at_their_usual_effort_are_fine()
    {
        var plan = Plan();
        var entries = Runs(plan, d => d >= new DateOnly(2026, 10, 26) && d < Today)
            .Select(s => Rated(s, ExpectedEffort.For(s.Type)!.Value.High)).ToList();
        RemainingWeek.FeltHarderTwice(entries).ShouldBeFalse();
        RemainingWeek.Preview(plan, entries, [], Today, reportedOnly: true).ShouldBeEmpty();
    }

    [Fact]
    public void In_reported_mode_a_day_without_a_check_in_is_not_a_missed_run()
    {
        var plan = Plan();
        // Nothing logged on Monday or Tuesday (an unrated Strava run, a delayed upload): no catch-up, no easing.
        RemainingWeek.Preview(plan, [], [], Today, reportedOnly: true).ShouldBeEmpty();
        // The runner's own "Ease the rest of this week" still treats unlogged days as missed, as before.
        RemainingWeek.Preview(plan, [], [], Today).ShouldNotBeEmpty();
    }

    [Fact]
    public void A_run_the_runner_said_they_skipped_still_counts_and_is_never_made_up()
    {
        var plan = Plan();
        var monday = Runs(plan, d => d == new DateOnly(2026, 10, 26)).Single();
        var changes = RemainingWeek.Preview(plan, [Rated(monday, 0, CheckInStatus.Skipped)], [], Today, reportedOnly: true);
        changes.ShouldNotBeEmpty();
        changes.ShouldAllBe(c => c.EasyKm == null || c.EasyKm <= c.OriginalKm);
    }

    [Fact]
    public void Pain_that_changed_the_running_rests_the_rest_of_the_week()
    {
        var plan = Plan();
        var monday = Runs(plan, d => d == new DateOnly(2026, 10, 26)).Single();
        var changes = RemainingWeek.Preview(plan, [Rated(monday, 4, pain: PainLevel.ChangedRunning)], [], Today, reportedOnly: true);
        changes.ShouldNotBeEmpty();
        changes.ShouldAllBe(c => c.EasyKm == null);
    }

    [Fact]
    public void Race_week_stays_as_written_whatever_the_ratings()
    {
        var plan = Plan();
        var raceWeek = plan.Weeks.Single(w => w.Phase == TrainingPhase.RaceWeek);
        var day = raceWeek.StartDate.AddDays(3);
        var entries = Runs(plan, d => d >= raceWeek.StartDate && d < day).Select(s => Rated(s, 10)).ToList();
        RemainingWeek.Preview(plan, entries, [], day, reportedOnly: true).ShouldBeEmpty();
    }
}
