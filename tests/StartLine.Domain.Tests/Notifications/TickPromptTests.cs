using StartLine.Domain.Activities;
using StartLine.Domain.Common;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;
using StartLine.Domain.Tests.Activities;

namespace StartLine.Domain.Tests.Notifications;

/// <summary>When a synced run asks the runner to tick their session, and what the push says.</summary>
public sealed class TickPromptTests
{
    private static readonly DateOnly Day = DateOnly.FromDateTime(RunBuilder.Start.UtcDateTime);

    private static readonly PlannedSessionMatch TempoMatch = new("Plan", SessionType.Tempo, "Tempo", 10, 240, 250, PaceZone.Tempo);

    // Tuesday 20 October 2026.
    private static readonly PlannedSession Tuesday = new(new DateOnly(2026, 10, 20), SessionType.Tempo, "Tempo", "", "", 10, PaceZone.Tempo);

    private static readonly TickPromptFacts Ready = new(RemindersOn: true, InPlan: true, CheckedIn: false, AlreadyPrompted: false);

    private static readonly DateTimeOffset AnHourLater = RunBuilder.Start.AddHours(1);

    private static Activity Synced(bool matched = true) =>
        Activity.Record(Guid.NewGuid(), new RunBuilder().Run(10_000, 250).Build(), Day, matched ? [TempoMatch] : [], ActivityOrigin.Strava(7, RunBuilder.Start, false));

    [Fact]
    public void A_fresh_synced_run_matching_a_session_with_no_check_in_asks_the_runner_who_has_reminders_on() =>
        TickPrompts.IsDue(Synced(), Ready, AnHourLater).ShouldBeTrue();

    [Fact]
    public void A_run_that_matched_no_session_asks_nothing() =>
        TickPrompts.IsDue(Synced(matched: false), Ready, AnHourLater).ShouldBeFalse();

    [Fact]
    public void A_session_no_longer_in_the_plan_asks_nothing() =>
        TickPrompts.IsDue(Synced(), Ready with { InPlan = false }, AnHourLater).ShouldBeFalse();

    [Fact]
    public void A_session_already_checked_in_on_asks_nothing() =>
        TickPrompts.IsDue(Synced(), Ready with { CheckedIn = true }, AnHourLater).ShouldBeFalse();

    [Fact]
    public void A_runner_without_reminders_on_is_never_asked() =>
        TickPrompts.IsDue(Synced(), Ready with { RemindersOn = false }, AnHourLater).ShouldBeFalse();

    [Fact]
    public void A_session_is_asked_about_once() =>
        TickPrompts.IsDue(Synced(), Ready with { AlreadyPrompted = true }, AnHourLater).ShouldBeFalse();

    [Fact]
    public void A_run_more_than_two_days_old_asks_nothing_so_a_backfill_never_floods()
    {
        TickPrompts.IsDue(Synced(), Ready, RunBuilder.Start + TickPrompts.MaxRunAge).ShouldBeTrue();
        TickPrompts.IsDue(Synced(), Ready, RunBuilder.Start + TickPrompts.MaxRunAge + TimeSpan.FromMinutes(1)).ShouldBeFalse();
    }

    [Fact]
    public void An_uploaded_run_asks_nothing_the_runner_is_already_in_the_app()
    {
        var upload = Activity.Record(Guid.NewGuid(), new RunBuilder().Run(10_000, 250).Build(), Day, [TempoMatch]);

        TickPrompts.IsDue(upload, Ready, AnHourLater).ShouldBeFalse();
    }

    [Fact]
    public void The_note_that_it_asked_holds_the_session_and_nothing_from_the_run()
    {
        var properties = typeof(TickPrompt).GetProperties().Select(p => p.Name).Order();

        properties.ShouldBe(["Date", "Id", "SavedPlanId", "SessionType"]);
        Should.Throw<DomainException>(() => TickPrompt.For(Guid.Empty, Day, SessionType.Tempo));
    }

    [Fact]
    public void The_note_is_kept_no_longer_than_a_synced_run() =>
        TickPrompts.KeptFor.ShouldBeLessThanOrEqualTo(StravaCache.Lifetime);

    [Fact]
    public void With_run_data_allowed_the_push_says_the_distance_and_when()
    {
        var body = TickPrompts.Body(Tuesday, 10.24, new DateTime(2026, 10, 20, 6, 15, 0), new DateOnly(2026, 10, 20), Units.Kilometres);

        TickPrompts.Title(Tuesday).ShouldBe("Ran Tuesday’s Tempo?");
        body.ShouldBe("Strava says you ran 10.2 km this morning. Tick Tuesday’s Tempo as done?");
    }

    [Fact]
    public void Without_run_data_the_push_says_nothing_from_the_run()
    {
        var body = TickPrompts.Body(Tuesday, null, new DateTime(2026, 10, 20, 6, 15, 0), new DateOnly(2026, 10, 20), Units.Kilometres);

        body.ShouldNotContain("km");
        body.ShouldNotContain("morning");
    }

    [Theory]
    [InlineData(6, 0, "this morning")]
    [InlineData(13, 0, "this afternoon")]
    [InlineData(19, 0, "this evening")]
    [InlineData(18, -1, "yesterday evening")]
    [InlineData(7, -2, "on Sunday")]
    public void When_is_said_from_the_runners_own_day(int hour, int daysAgo, string expected)
    {
        var today = new DateOnly(2026, 10, 20);

        TickPrompts.When(today.AddDays(daysAgo).ToDateTime(new TimeOnly(hour, 0)), today).ShouldBe(expected);
    }
}
