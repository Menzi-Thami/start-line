using System.Text.Json;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;
using StartLine.Domain.Tests.Activities;

namespace StartLine.Domain.Tests.Plans;

public sealed class AdaptiveWeekTests
{
    private static readonly DateOnly Today = new(2026, 10, 28);
    private static TrainingPlan Plan(int version) => TrainingPlanGenerator.Generate(new PlanParameters(Distance.TenK,
        TimeSpan.FromMinutes(52), new DateOnly(2026, 12, 20), new DateOnly(2026, 10, 19),
        [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Friday, DayOfWeek.Sunday], DayOfWeek.Sunday, 40,
        StrengthDays: [DayOfWeek.Thursday], GeneratorVersion: version));
    private static SessionCheckIn Entry(double? km = 10, PainLevel pain = PainLevel.None) => SessionCheckIn.CreateAdditional(Guid.NewGuid(), Guid.NewGuid(), Today,
        SessionType.Easy, new(CheckInStatus.Done, null, pain, pain == PainLevel.ChangedRunning ? BodyArea.Knee : null, DistanceKm: km, DistanceUnreported: km is null));

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void A_reset_preserves_history_strength_future_weeks_and_does_not_add_days_or_kilometres(int version)
    {
        var plan = Plan(version);
        var revisions = RemainingWeek.Preview(plan, [Entry()], [], Today);
        revisions.ShouldNotBeEmpty();
        var adjusted = RemainingWeek.Apply(plan, revisions);
        var preserved = plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Date <= Today || s.Date >= Today.AddDays(5) || s.Type == SessionType.Strength);
        JsonSerializer.Serialize(adjusted.Weeks.SelectMany(w => w.Sessions).Where(s => s.Date <= Today || s.Date >= Today.AddDays(5) || s.Type == SessionType.Strength)).ShouldBe(JsonSerializer.Serialize(preserved));
        adjusted.Weeks.SelectMany(w => w.Sessions).Where(s => revisions.Any(r => r.Date == s.Date)).ShouldAllBe(s => s.Type == SessionType.Easy && s.DistanceKm <= 8 && s.Steps != null);
        revisions.ShouldAllBe(r => r.EasyKm <= r.OriginalKm);
    }
    [Fact]
    public void Repeating_a_review_with_unchanged_evidence_does_not_shrink_the_week_again()
    {
        var plan = Plan(2); var entries = new[] { Entry(30) };
        var week = plan.Weeks.Single(w => w.StartDate <= Today && Today < w.StartDate.AddDays(7));
        var adjusted = RemainingWeek.Apply(plan, RemainingWeek.Preview(plan, entries, [], Today));
        RemainingWeek.Preview(adjusted, entries, [], Today, week.PlannedKm).ShouldBeEmpty();
    }
    [Theory]
    [InlineData(100, PainLevel.None)]
    [InlineData(10, PainLevel.ChangedRunning)]
    public void High_actual_volume_or_pain_suggests_rest(double km, PainLevel pain) => RemainingWeek.Preview(Plan(2), [Entry(km, pain)], [], Today).ShouldAllBe(c => c.EasyKm == null);
    [Fact]
    public void Race_week_is_not_rewritten()
    {
        var plan = Plan(2); var week = plan.Weeks.Single(w => w.Phase == TrainingPhase.RaceWeek);
        RemainingWeek.Preview(plan, [], [], week.StartDate.AddDays(3)).ShouldBeEmpty();
    }
    [Fact]
    public void Cached_strava_metrics_never_affect_a_permanent_adjustment()
    {
        var plan = Plan(2); var entries = new[] { Entry(null) };
        var run = Activity.Record(Guid.NewGuid(), new RunBuilder().Run(100_000, 360).Build(), Today, [], ActivityOrigin.Strava(42, RunBuilder.Start, false));
        RemainingWeek.Preview(plan, entries, [run], Today).ShouldBe(RemainingWeek.Preview(plan, entries, [], Today));
    }
    [Fact]
    public void Later_paces_cannot_rewrite_accepted_steps()
    {
        var plan = Plan(2); var revisions = RemainingWeek.Preview(plan, [Entry()], [], Today);
        var dates = revisions.Select(c => c.Date).ToHashSet();
        var later = plan with { Paces = plan.Paces.ToDictionary(p => p.Key, p => new PaceRange(Pace.FromSecondsPerKilometre(p.Value.Fastest.SecondsPerKilometre + 30), Pace.FromSecondsPerKilometre(p.Value.Slowest.SecondsPerKilometre + 30))) };
        JsonSerializer.Serialize(RemainingWeek.Apply(later, revisions).Weeks.SelectMany(w => w.Sessions).Where(s => dates.Contains(s.Date)))
            .ShouldBe(JsonSerializer.Serialize(RemainingWeek.Apply(plan, revisions).Weeks.SelectMany(w => w.Sessions).Where(s => dates.Contains(s.Date))));
    }
    [Fact]
    public void Time_only_or_linked_entries_count_without_inventing_distance()
    {
        var entry = Entry(null);
        var result = RunningLog.Of([new(Today, 0, entry.Answers, true)], []).ShouldHaveSingleItem();
        result.DistanceUnreported.ShouldBeTrue(); result.DistanceKm.ShouldBe(0);
    }
    [Fact]
    public void Daily_recovery_is_due_at_six_once_and_stops_after_the_plan()
    {
        var plan = Plan(2);
        var device = PushSubscription.Start(Guid.NewGuid(), new string('a', 64), new("e", "k", "a"), new(6, 0), false, Today.AddDays(-1).ToDateTime(new(20, 0)), daily: true);
        var rest = Today.AddDays(1); var facts = new ReminderFacts(plan, Domain.Runners.Units.Kilometres);
        Reminders.Due(device, facts, rest.ToDateTime(new(5, 59))).ShouldBeNull();
        Reminders.Due(device, facts, rest.ToDateTime(new(6, 0)))!.Title.ShouldBe("Today: Strength");
        device.MarkReminded(rest); Reminders.Due(device, facts, rest.ToDateTime(new(8, 0))).ShouldBeNull();
        Reminders.Due(device, facts, plan.RaceDate.AddDays(1).ToDateTime(new(6, 0))).ShouldBeNull();
    }
}
