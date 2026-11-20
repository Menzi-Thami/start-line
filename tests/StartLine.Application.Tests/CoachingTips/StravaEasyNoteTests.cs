using StartLine.Application.Features.CoachingTips;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Tests.CoachingTips;

/// <summary>
/// The personal note for easy runs held from Strava: the same test as the <c>easy-fast</c> rule on the held runs, added to
/// that week's email and stored nowhere. Not when the main tip is already <c>easy-fast</c>, nor in race week, nor when the
/// kept-runs rule fired.
/// </summary>
public sealed class StravaEasyNoteTests
{
    private static readonly DateOnly Thursday = new(2026, 11, 19);

    // 5:40–6:10/km: too fast is quicker than 5:30/km (330 s/km).
    private static readonly PaceRange Easy = new(Pace.FromSecondsPerKilometre(340), Pace.FromSecondsPerKilometre(370));

    private static CoachingTipFacts Facts(double[] held, double[]? kept = null, int raceInDays = 60, Units units = Units.Kilometres) =>
        new(Thursday, Thursday.AddDays(raceInDays), CoachingTrack.Improving, RanLastWeek: true,
            EasyRuns: [.. (kept ?? []).Select(p => new EasyRunPace(p, 8))], EasyPaces: Easy, Units: units,
            HeldEasyRuns: [.. held.Select(p => new EasyRunPace(p, 8))]);

    private static CoachingNote? Note(CoachingTipFacts facts, params PastCoachingTip[] history) =>
        CoachingTipSelector.StravaEasyNote(facts, CoachingTipSelector.Choose(facts, history));

    [Fact]
    public void Fast_held_easy_runs_give_a_note_in_the_runners_paces_while_the_main_tip_stays_on_track()
    {
        var facts = Facts(held: [300, 300]);
        CoachingTipSelector.Choose(facts, []).Tip.Key.ShouldBe("b-1");
        var note = Note(facts).ShouldNotBeNull();
        note.Heading.ShouldBe("About your easy runs");
        note.Text.ShouldStartWith("Your easy runs from Strava last week averaged 5:00/km; your plan's easy pace is 5:40–6:10/km.");
        note.Text.ShouldContain("Slow is the point");
        Note(Facts(held: [300, 300, 350])).ShouldNotBeNull().Text.ShouldStartWith("2 of your 3 easy runs from Strava last week averaged 5:00/km;");
    }

    [Fact]
    public void Miles_runners_see_paces_per_mile() =>
        Note(Facts(held: [300, 300], units: Units.Miles)).ShouldNotBeNull().Text
            .ShouldStartWith("Your easy runs from Strava last week averaged 8:03/mi; your plan's easy pace is 9:07–9:55/mi.");

    [Theory]
    [InlineData(330.0)] // exactly 10 s/km quicker: not too fast
    [InlineData(350.0)] // inside the range
    public void Held_runs_within_the_rule_give_no_note(double pace) => Note(Facts(held: [pace, pace])).ShouldBeNull();

    [Fact]
    public void One_fast_held_run_or_fewer_than_half_gives_no_note()
    {
        Note(Facts(held: [300])).ShouldBeNull();
        Note(Facts(held: [300, 300, 350, 350, 350])).ShouldBeNull();
        Note(Facts(held: [])).ShouldBeNull();
        Note(Facts(held: [300, 300]) with { EasyPaces = null }).ShouldBeNull();
    }

    [Fact]
    public void No_note_when_the_main_tip_is_already_easy_fast()
    {
        var facts = Facts(held: [300, 300], kept: [300, 300]);
        CoachingTipSelector.Choose(facts, []).Reason.ShouldBe(CoachingTipReason.EasyTooFast);
        Note(facts).ShouldBeNull();
    }

    [Fact]
    public void No_note_when_the_kept_runs_rule_fired_even_if_its_tip_went_recently()
    {
        var facts = Facts(held: [300, 300], kept: [300, 300]);
        var recent = new PastCoachingTip(Thursday.AddDays(-14), "easy-fast");
        CoachingTipSelector.Choose(facts, [recent]).Reason.ShouldBe(CoachingTipReason.Track);
        Note(facts, recent).ShouldBeNull();
    }

    [Fact]
    public void No_note_in_race_week_but_one_in_the_taper()
    {
        Note(Facts(held: [300, 300], raceInDays: 3)).ShouldBeNull();
        var taper = Facts(held: [300, 300], raceInDays: 12);
        CoachingTipSelector.Choose(taper, []).Reason.ShouldBe(CoachingTipReason.Taper);
        Note(taper).ShouldNotBeNull();
    }

    [Fact]
    public void The_note_comes_again_each_week_because_nothing_records_it()
    {
        // History only ever holds main tips' keys; a note never adds one, so it isn't held back by the four-week rule.
        Note(Facts(held: [300, 300]), new PastCoachingTip(Thursday.AddDays(-7), "b-1")).ShouldNotBeNull();
    }
}
