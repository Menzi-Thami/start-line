using StartLine.Application.Features.CoachingTips;
using StartLine.Domain.Plans;

namespace StartLine.Application.Tests.CoachingTips;

/// <summary>
/// Which tip a runner gets on a Thursday: race week, then the taper, a long-run jump, a quiet week on the plan, then the
/// next step on their track and the rotation after it. An override sent in the last four weeks falls through.
/// </summary>
public sealed class CoachingTipSelectionTests
{
    private static readonly DateOnly Thursday = new(2026, 11, 19);

    private static CoachingTipFacts Facts(
        int? raceInDays = null,
        CoachingTrack track = CoachingTrack.Improving,
        double? longest = null,
        double? before = null,
        bool planned = false,
        bool ran = true) =>
        new(Thursday, raceInDays is { } days ? Thursday.AddDays(days) : null, track, longest, before, planned, ran);

    private static PastCoachingTip Sent(string key, int weeksAgo) => new(Thursday.AddDays(-7 * weeksAgo), key);

    private static CoachingTipChoice Choose(CoachingTipFacts facts, params PastCoachingTip[] history) => CoachingTipSelector.Choose(facts, history);

    [Fact]
    public void Thursday_is_a_Thursday() => Thursday.DayOfWeek.ShouldBe(DayOfWeek.Thursday);

    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    [InlineData(6)]
    public void Race_week_is_the_race_zero_to_six_days_after_the_Thursday(int days)
    {
        var choice = Choose(Facts(raceInDays: days));
        choice.Reason.ShouldBe(CoachingTipReason.RaceWeek);
        choice.Tip.Key.ShouldBe("race-1");
        choice.Tip.Title.ShouldBe("Nothing new on race day");
    }

    [Theory]
    [InlineData(7)]
    [InlineData(14)]
    [InlineData(20)]
    public void The_taper_is_the_race_seven_to_twenty_days_away(int days)
    {
        var choice = Choose(Facts(raceInDays: days));
        choice.Reason.ShouldBe(CoachingTipReason.Taper);
        choice.Tip.Key.ShouldBe("taper-1");
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(21)]
    [InlineData(90)]
    public void A_race_already_run_or_three_weeks_away_is_neither(int days) =>
        Choose(Facts(raceInDays: days)).Reason.ShouldBe(CoachingTipReason.Track);

    [Fact]
    public void Each_race_week_and_taper_takes_the_next_tip_never_sent_and_then_the_one_sent_longest_ago()
    {
        Choose(Facts(raceInDays: 13), Sent("taper-1", 1)).Tip.Key.ShouldBe("taper-2");
        Choose(Facts(raceInDays: 2), Sent("race-1", 30)).Tip.Key.ShouldBe("race-2");
        Choose(Facts(raceInDays: 2), Sent("race-1", 30), Sent("race-2", 20)).Tip.Key.ShouldBe("race-3");
        Choose(Facts(raceInDays: 2), Sent("race-1", 30), Sent("race-2", 20), Sent("race-3", 10)).Tip.Key.ShouldBe("race-1");
        Choose(Facts(raceInDays: 2), Sent("race-1", 10), Sent("race-2", 30), Sent("race-3", 20)).Tip.Key.ShouldBe("race-2");
    }

    [Fact]
    public void An_override_sent_in_the_last_four_weeks_falls_through_to_the_next_rule()
    {
        // Both taper tips in the last four weeks: the long-run jump is next.
        var choice = Choose(Facts(raceInDays: 10, longest: 15, before: 12), Sent("taper-1", 2), Sent("taper-2", 1));
        choice.Reason.ShouldBe(CoachingTipReason.LongRunJump);

        // Every race tip in the last four weeks, nothing else applies: the track.
        Choose(Facts(raceInDays: 1), Sent("race-1", 3), Sent("race-2", 2), Sent("race-3", 1)).Reason.ShouldBe(CoachingTipReason.Track);

        // The jump three weeks ago: the comeback, then the track.
        Choose(Facts(longest: 15, before: 12, planned: true, ran: false), Sent("spike", 3)).Reason.ShouldBe(CoachingTipReason.Comeback);
        Choose(Facts(longest: 15, before: 12), Sent("spike", 3)).Reason.ShouldBe(CoachingTipReason.Track);

        // The comeback last week: the track.
        Choose(Facts(planned: true, ran: false), Sent("comeback", 1)).Reason.ShouldBe(CoachingTipReason.Track);
    }

    [Fact]
    public void Four_weeks_to_the_day_is_long_enough_to_send_an_override_again()
    {
        Choose(Facts(longest: 15, before: 12), Sent("spike", 4)).Reason.ShouldBe(CoachingTipReason.LongRunJump);
        Choose(Facts(planned: true, ran: false), Sent("comeback", 4)).Reason.ShouldBe(CoachingTipReason.Comeback);
        Choose(Facts(raceInDays: 8), Sent("taper-1", 4), Sent("taper-2", 3)).Tip.Key.ShouldBe("taper-1");
    }

    [Fact]
    public void The_rules_are_checked_in_order_and_the_first_match_wins()
    {
        var everything = Facts(raceInDays: 4, longest: 20, before: 10, planned: true, ran: false);
        Choose(everything).Reason.ShouldBe(CoachingTipReason.RaceWeek);
        Choose(everything with { RaceDate = Thursday.AddDays(12) }).Reason.ShouldBe(CoachingTipReason.Taper);
        Choose(everything with { RaceDate = Thursday.AddDays(40) }).Reason.ShouldBe(CoachingTipReason.LongRunJump);
        Choose(everything with { RaceDate = Thursday.AddDays(40), LongestLastWeekKm = null }).Reason.ShouldBe(CoachingTipReason.Comeback);
        Choose(everything with { RaceDate = Thursday.AddDays(40), LongestLastWeekKm = null, RanLastWeek = true }).Reason.ShouldBe(CoachingTipReason.Track);
    }

    [Fact]
    public void A_long_run_jump_is_personalised_with_both_distances_and_a_cap_of_one_point_one_times_the_earlier()
    {
        var choice = Choose(Facts(longest: 14, before: 12));
        choice.Reason.ShouldBe(CoachingTipReason.LongRunJump);
        choice.Tip.Key.ShouldBe("spike");
        choice.Tip.Title.ShouldBe("Easy on the long-run jumps");
        choice.Tip.Body.ShouldStartWith("Your longest run this week (14 km) was more than 10% beyond your longest in the previous month (12 km).");
        choice.Tip.Body.ShouldContain("Keep the next one nearer 13.2 km");
        choice.Tip.Body.ShouldContain("never squeeze missed runs into one long run");
    }

    [Theory]
    [InlineData(11.0, 10.0, false)] // exactly 10%
    [InlineData(2.2, 2.0, false)] // exactly 10%, at the smallest earlier run
    [InlineData(16.5, 15.0, false)] // exactly 10%
    [InlineData(11.01, 10.0, true)] // just over
    [InlineData(3.0, 2.0, true)] // an earlier run of exactly 2 km counts
    [InlineData(5.0, 1.99, false)] // no earlier run of at least 2 km
    [InlineData(10.0, 12.0, false)] // shorter than before
    public void A_jump_is_more_than_ten_percent_beyond_an_earlier_run_of_at_least_two_km(double longest, double before, bool jump)
    {
        CoachingTipSelector.IsLongRunJump(longest, before).ShouldBe(jump);
        Choose(Facts(longest: longest, before: before)).Reason.ShouldBe(jump ? CoachingTipReason.LongRunJump : CoachingTipReason.Track);
    }

    [Fact]
    public void No_run_in_the_earlier_month_or_none_last_week_means_no_jump()
    {
        Choose(Facts(longest: 12, before: null)).Reason.ShouldBe(CoachingTipReason.Track);
        Choose(Facts(longest: null, before: 12)).Reason.ShouldBe(CoachingTipReason.Track);
    }

    [Fact]
    public void A_comeback_needs_planned_sessions_last_week_and_no_run_logged()
    {
        Choose(Facts(planned: true, ran: false)).Tip.Key.ShouldBe("comeback");
        Choose(Facts(planned: true, ran: true)).Reason.ShouldBe(CoachingTipReason.Track);
        Choose(Facts(planned: false, ran: false)).Reason.ShouldBe(CoachingTipReason.Track);

        // The race has been and gone: nothing to pick back up.
        Choose(Facts(raceInDays: -2, planned: true, ran: false)).Reason.ShouldBe(CoachingTipReason.Track);
    }

    [Theory]
    [InlineData(null, false, CoachingTrack.NewRunner)]
    [InlineData(Experience.New, false, CoachingTrack.NewRunner)]
    [InlineData(Experience.Regular, true, CoachingTrack.NewRunner)]
    [InlineData(Experience.Experienced, true, CoachingTrack.NewRunner)]
    [InlineData(Experience.Regular, false, CoachingTrack.Improving)]
    [InlineData(Experience.Experienced, false, CoachingTrack.Improving)]
    public void New_runners_no_plan_and_Couch_to_5K_follow_track_A_and_everyone_else_track_B(Experience? experience, bool couchTo5K, CoachingTrack track) =>
        CoachingTipSelector.TrackFor(experience, couchTo5K).ShouldBe(track);

    [Fact]
    public void Each_track_starts_at_its_first_tip()
    {
        Choose(Facts(track: CoachingTrack.NewRunner)).Tip.ShouldBe(CoachingTipBank.NewRunner[0]);
        Choose(Facts(track: CoachingTrack.Improving)).Tip.ShouldBe(CoachingTipBank.Improving[0]);
    }

    [Fact]
    public void The_step_is_the_number_of_tips_already_sent_from_that_track()
    {
        Choose(Facts(track: CoachingTrack.NewRunner), Sent("a-1", 3), Sent("a-2", 2), Sent("a-3", 1)).Tip.Key.ShouldBe("a-4");

        // Overrides and the other track's tips don't move the step.
        Choose(Facts(track: CoachingTrack.NewRunner), Sent("a-1", 6), Sent("race-1", 5), Sent("spike", 4), Sent("b-1", 3), Sent("comeback", 2), Sent("g-1", 1))
            .Tip.Key.ShouldBe("a-2");
        Choose(Facts(track: CoachingTrack.Improving), Sent("a-1", 3), Sent("a-2", 2), Sent("b-1", 1)).Tip.Key.ShouldBe("b-2");
    }

    [Fact]
    public void After_twelve_the_rotation_follows_and_then_goes_round_again()
    {
        var twelve = Enumerable.Range(0, 12).Select(i => Sent(CoachingTipBank.Improving[i].Key, 40 - i)).ToArray();
        var afterTwelve = Choose(Facts(), twelve);
        afterTwelve.Reason.ShouldBe(CoachingTipReason.Rotation);
        afterTwelve.Tip.Key.ShouldBe("g-1");

        Choose(Facts(), [.. twelve, Sent("g-1", 2), Sent("g-2", 1)]).Tip.Key.ShouldBe("g-3");
        var nineteen = Enumerable.Range(0, 19).Select(i => Sent(CoachingTipBank.Rotation[i].Key, 39 - i)).ToArray();
        Choose(Facts(), [.. twelve, .. nineteen]).Tip.Key.ShouldBe("g-20");
        var round = Enumerable.Range(0, CoachingTipBank.Rotation.Count).Select(i => Sent(CoachingTipBank.Rotation[i].Key, 39 - i)).ToArray();
        Choose(Facts(), [.. twelve, .. round]).Tip.Key.ShouldBe("g-1");
        Choose(Facts(), [.. twelve, .. round, Sent("g-1", 3), Sent("g-2", 2), Sent("g-3", 1)]).Tip.Key.ShouldBe("g-4");
    }

    [Fact]
    public void A_tip_already_on_this_Thursday_is_a_retry_and_doesnt_count_as_history()
    {
        Choose(Facts(track: CoachingTrack.NewRunner), new PastCoachingTip(Thursday, "a-1")).Tip.Key.ShouldBe("a-1");
        Choose(Facts(longest: 15, before: 12), new PastCoachingTip(Thursday, "spike")).Reason.ShouldBe(CoachingTipReason.LongRunJump);
    }
}
