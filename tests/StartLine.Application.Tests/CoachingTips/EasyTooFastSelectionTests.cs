using StartLine.Application.Features.CoachingTips;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Tests.CoachingTips;

/// <summary>
/// The "easy runs too fast" rule: at least two of last week's kept easy runs more than 10 s/km quicker than the fast end of
/// the plan's easy range, making up at least half of the easy runs with a pace. It sits after the long-run jump and before
/// the comeback, never repeats within four weeks, and shows paces in the runner's units.
/// </summary>
public sealed class EasyTooFastSelectionTests
{
    private static readonly DateOnly Thursday = new(2026, 11, 19);

    // 5:40–6:10/km: too fast is quicker than 5:30/km (330 s/km).
    private static readonly PaceRange Easy = new(Pace.FromSecondsPerKilometre(340), Pace.FromSecondsPerKilometre(370));

    private static CoachingTipFacts Facts(Units units = Units.Kilometres, double? longest = null, double? before = null, bool planned = false, bool ran = true, params double[] paces) =>
        new(Thursday, Thursday.AddDays(60), CoachingTrack.Improving, longest, before, planned, ran,
            [.. paces.Select(p => new EasyRunPace(p, 8))], Easy, units);

    private static CoachingTipChoice Choose(CoachingTipFacts facts, params PastCoachingTip[] history) => CoachingTipSelector.Choose(facts, history);

    [Fact]
    public void Two_easy_runs_well_under_the_easy_range_send_the_tip_with_the_runners_paces()
    {
        var choice = Choose(Facts(paces: [320, 320, 350]));
        choice.Reason.ShouldBe(CoachingTipReason.EasyTooFast);
        choice.Tip.Key.ShouldBe("easy-fast");
        choice.Tip.Title.ShouldBe("Easy should feel easy");
        choice.Tip.Body.ShouldStartWith("2 of your 3 easy runs last week averaged 5:20/km; your plan's easy pace is 5:40–6:10/km.");
        choice.Tip.Body.ShouldContain("talk test");
        choice.Tip.Body.ShouldContain("Slow is the point.");
        choice.Tip.Body.ShouldContain("Running every run moderately hard tires you without making you fitter any faster.");
    }

    [Fact]
    public void When_every_easy_run_was_too_fast_it_says_your_easy_runs_and_averages_by_distance()
    {
        var facts = Facts() with { EasyRuns = [new(300, 10), new(320, 5)] };
        CoachingTipSelector.Choose(facts, []).Tip.Body.ShouldStartWith("Your easy runs last week averaged 5:07/km;");
    }

    [Fact]
    public void Miles_runners_see_paces_per_mile()
    {
        var tip = Choose(Facts(Units.Miles, paces: [320, 320])).Tip;
        tip.Body.ShouldStartWith("Your easy runs last week averaged 8:35/mi; your plan's easy pace is 9:07–9:55/mi.");
        tip.Body.ShouldNotContain("/km");
    }

    [Theory]
    [InlineData(330.0, false)] // exactly 10 s/km quicker than the fast end
    [InlineData(330.04, false)] // rounds to exactly 10
    [InlineData(329.9, true)] // just over 10
    [InlineData(340.0, false)] // at the fast end
    [InlineData(365.0, false)] // inside the range
    public void Too_fast_is_more_than_ten_seconds_per_km_quicker_than_the_fast_end(double pace, bool tooFast)
    {
        CoachingTipSelector.IsTooFastForEasy(pace, Easy).ShouldBe(tooFast);
        Choose(Facts(paces: [pace, pace])).Reason.ShouldBe(tooFast ? CoachingTipReason.EasyTooFast : CoachingTipReason.Track);
    }

    [Fact]
    public void One_fast_run_is_not_enough()
    {
        Choose(Facts(paces: [300])).Reason.ShouldBe(CoachingTipReason.Track);
        Choose(Facts(paces: [300, 350])).Reason.ShouldBe(CoachingTipReason.Track);
    }

    [Fact]
    public void The_fast_runs_must_be_at_least_half_of_the_easy_runs_with_a_pace()
    {
        Choose(Facts(paces: [300, 300, 350, 350])).Reason.ShouldBe(CoachingTipReason.EasyTooFast);
        Choose(Facts(paces: [300, 300, 350, 350, 350])).Reason.ShouldBe(CoachingTipReason.Track);
    }

    [Fact]
    public void No_plan_paces_or_no_easy_runs_means_no_tip()
    {
        CoachingTipSelector.EasyTooFast(Facts(paces: [300, 300]) with { EasyPaces = null }).ShouldBeNull();
        CoachingTipSelector.EasyTooFast(Facts()).ShouldBeNull();
        CoachingTipSelector.EasyTooFast(Facts() with { EasyRuns = null }).ShouldBeNull();
    }

    [Fact]
    public void It_comes_after_the_long_run_jump_and_before_the_comeback()
    {
        Choose(Facts(longest: 15, before: 12, paces: [300, 300])).Reason.ShouldBe(CoachingTipReason.LongRunJump);
        Choose(Facts(planned: true, ran: false, paces: [300, 300])).Reason.ShouldBe(CoachingTipReason.EasyTooFast);
    }

    [Fact]
    public void It_isnt_sent_again_within_four_weeks()
    {
        Choose(Facts(paces: [300, 300]), new PastCoachingTip(Thursday.AddDays(-21), "easy-fast")).Reason.ShouldBe(CoachingTipReason.Track);
        Choose(Facts(planned: true, ran: false, paces: [300, 300]), new PastCoachingTip(Thursday.AddDays(-21), "easy-fast")).Reason.ShouldBe(CoachingTipReason.Comeback);
        Choose(Facts(paces: [300, 300]), new PastCoachingTip(Thursday.AddDays(-28), "easy-fast")).Reason.ShouldBe(CoachingTipReason.EasyTooFast);
    }
}
