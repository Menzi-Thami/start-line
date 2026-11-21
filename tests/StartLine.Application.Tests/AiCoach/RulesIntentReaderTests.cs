using StartLine.Application.Features.AiCoach;
using StartLine.Domain.Plans;

namespace StartLine.Application.Tests.AiCoach;

/// <summary>The coach's own reading of a question, used when the AI is off, not agreed to, over budget or unavailable.</summary>
public sealed class RulesIntentReaderTests
{
    // A Friday.
    private static readonly DateOnly Today = new(2026, 11, 20);

    [Theory]
    [InlineData("I only have 35 minutes tomorrow", 35, 1)]
    [InlineData("Only got half an hour today", 30, 0)]
    [InlineData("I have an hour on Sunday", 60, 2)]
    [InlineData("1h30 for my long run saturday?", 90, 1)]
    [InlineData("can I do 1.5 hours on Saturday", 90, 1)]
    [InlineData("45 mins on friday", 45, 0)]
    public void Time_requests_become_duration_changes(string question, int minutes, int daysAhead)
    {
        var intent = RulesIntentReader.Read(question, Today);
        intent.Kind.ShouldBe(CoachIntentKind.AdjustSession);
        intent.Adjustment.ShouldBe(AdjustmentKind.Duration);
        intent.Minutes.ShouldBe(minutes);
        intent.Date.ShouldBe(Today.AddDays(daysAhead));
    }

    [Theory]
    [InlineData("make Saturday 18 km", 18.0)]
    [InlineData("Can my long run be 16k", 16.0)]
    [InlineData("shorten it to 8,5 kilometres", 8.5)]
    [InlineData("I'd like 5 miles instead", 8.05)]
    public void Distance_requests_become_distance_changes(string question, double km)
    {
        var intent = RulesIntentReader.Read(question, Today);
        intent.Adjustment.ShouldBe(AdjustmentKind.Distance);
        intent.Km.ShouldBe(km);
    }

    [Theory]
    [InlineData("run my easy at 6:15/km", 375)]
    [InlineData("can I do 6.30 per km tomorrow", 390)]
    [InlineData("I want to run 10:00 min/mile", 373)]
    public void Paces_with_units_become_pace_changes(string question, int seconds)
    {
        var intent = RulesIntentReader.Read(question, Today);
        intent.Adjustment.ShouldBe(AdjustmentKind.Pace);
        intent.PaceSecondsPerKm.ShouldBe(seconds);
    }

    [Fact]
    public void A_clock_time_is_not_a_pace() =>
        RulesIntentReader.Read("I run at 5:30 in the morning", Today).Kind.ShouldNotBe(CoachIntentKind.AdjustSession);

    [Fact]
    public void Both_a_time_and_a_distance_asks_one_question_back() =>
        RulesIntentReader.Read("can I do 10 km in 50 minutes", Today).Kind.ShouldBe(CoachIntentKind.Clarify);

    [Theory]
    [InlineData("How should next week change after these runs?")]
    [InlineData("adapt my plan please")]
    public void Questions_about_the_weeks_ahead_open_the_weekly_review(string question) =>
        RulesIntentReader.Read(question, Today).Kind.ShouldBe(CoachIntentKind.WeeklyReview);

    [Fact]
    public void Anything_else_is_answered_in_words_never_guessed_into_a_change()
    {
        var intent = RulesIntentReader.Read("Why is my easy pace so slow?", Today);
        intent.Kind.ShouldBe(CoachIntentKind.Answer);
        intent.Adjustment.ShouldBeNull();
    }

    [Fact]
    public void A_weekday_is_the_next_one_from_today_today_included()
    {
        RulesIntentReader.DateIn("friday", Today).ShouldBe(Today);
        RulesIntentReader.DateIn("thursday", Today).ShouldBe(Today.AddDays(6));
        RulesIntentReader.DateIn("no day here", Today).ShouldBeNull();
    }

    [Fact]
    public void A_weekday_without_a_run_means_the_same_day_next_week_when_that_one_has_a_run()
    {
        // Friday 20 November; the plan starts later, so Sunday 22 has no run and Sunday 29 has the long run.
        var sunday = Today.AddDays(2);
        bool HasRun(DateOnly day) => day == sunday.AddDays(7);
        RulesIntentReader.DateIn("make sunday 18 km", Today, HasRun).ShouldBe(sunday.AddDays(7));
        RulesIntentReader.Read("make sunday 18 km", Today, HasRun).Date.ShouldBe(sunday.AddDays(7));
        // Today and tomorrow mean exactly that, run or not.
        RulesIntentReader.DateIn("tomorrow", Today, HasRun).ShouldBe(Today.AddDays(1));
        RulesIntentReader.DateIn("today", Today, HasRun).ShouldBe(Today);
        // No run either week: the nearest one, and the rules say why it can't change.
        RulesIntentReader.DateIn("saturday", Today, _ => false).ShouldBe(Today.AddDays(1));
        // A run on the nearest one: that one.
        RulesIntentReader.DateIn("sunday", Today, _ => true).ShouldBe(sunday);
    }
}
