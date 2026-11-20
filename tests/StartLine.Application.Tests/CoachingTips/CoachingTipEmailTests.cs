using System.Text.RegularExpressions;
using StartLine.Application.Features.CoachingTips;
using StartLine.Application.Features.Insights;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Tests.CoachingTips;

/// <summary>The tip bank's shape, and the tip email's words, look, button, plain text and way out.</summary>
public sealed partial class CoachingTipEmailTests
{
    private static readonly UnsubscribeLinks Weekly = UnsubscribeLinks.For("KEY", new Uri("https://api.example.test"), weekly: true);
    private static readonly DateOnly Thursday = new(2026, 11, 19);
    private static readonly PaceRange Easy = new(Pace.FromSecondsPerKilometre(340), Pace.FromSecondsPerKilometre(370));

    [Fact]
    public void The_bank_has_twelve_tips_per_track_twenty_in_rotation_and_every_key_once()
    {
        CoachingTipBank.NewRunner.Count.ShouldBe(12);
        CoachingTipBank.Improving.Count.ShouldBe(12);
        CoachingTipBank.Rotation.Count.ShouldBe(20);
        CoachingTipBank.RaceWeek.Count.ShouldBe(3);
        CoachingTipBank.Taper.Count.ShouldBe(2);
        var keys = CoachingTipBank.All.Select(t => t.Key).ToList();
        keys.ShouldBeUnique();
        keys.ShouldAllBe(k => k.Length <= 16);
        CoachingTipBank.NewRunner.Select(t => t.Key).ShouldBe(Enumerable.Range(1, 12).Select(i => $"a-{i}"));
        CoachingTipBank.Improving.Select(t => t.Key).ShouldBe(Enumerable.Range(1, 12).Select(i => $"b-{i}"));
        CoachingTipBank.Rotation.Select(t => t.Key).ShouldBe(Enumerable.Range(1, 20).Select(i => $"g-{i}"));
        CoachingTipBank.All.ShouldContain(CoachingTipBank.EasyFast);
    }

    [Fact]
    public void Every_tip_is_a_title_and_two_to_four_short_sentences_with_no_exact_fuelling_numbers()
    {
        foreach (var tip in CoachingTipBank.All.Append(CoachingTipBank.LongRunJump(14, 12)).Append(CoachingTipBank.EasyTooFast(320, Easy, Units.Kilometres, 2, 3)))
        {
            tip.Title.ShouldNotBeNullOrWhiteSpace();
            Sentences().Count(tip.Body).ShouldBeInRange(2, 4, tip.Key);
            tip.Body.ShouldNotContain("g/kg");
            tip.Body.ShouldNotContain("mg/kg");
            tip.Body.ShouldNotContain("  ");
        }

        // Where pain comes up, the tip says who to see; it never diagnoses.
        CoachingTipBank.NewRunner.Single(t => t.Key == "a-7").Body.ShouldContain("see a physio or sports doctor if it lingers");
        CoachingTipBank.Rotation.Single(t => t.Key == "g-6").Body.ShouldContain("see a physio or sports doctor if it lingers");
    }

    [Fact]
    public void A_runners_tip_greets_by_first_name_opens_this_week_and_stops_the_weekly_emails_only()
    {
        var tip = CoachingTipBank.NewRunner[0];
        var mail = CoachingTipEmail.Compose("naledi@example.com", tip, Thursday, "Naledi Dlamini", Weekly);

        mail.Subject.ShouldBe("Your Taperday tip: The talk test");
        mail.To.ShouldBe("naledi@example.com");
        mail.Unsubscribe.ShouldBe(Weekly);
        mail.Html.ShouldContain("<html lang=\"en-GB\">");
        mail.Html.ShouldContain(EmailLayout.Encode("Your Thursday tip · 19 November"));
        mail.Html.ShouldContain("The talk test.</h1>");
        mail.Html.ShouldContain("Hi Naledi.");
        mail.Html.ShouldNotContain("Dlamini");
        mail.Html.ShouldContain(EmailLayout.Encode(tip.Body));
        mail.Html.ShouldContain("href=\"https://taperday.run\"");
        mail.Html.ShouldContain("Open this week");
        mail.Html.ShouldContain("/email/wordmark.png");
        mail.Html.ShouldContain("Part of your weekly emails from Taperday: a recap on Mondays and a coaching tip on Thursdays.");
        mail.Html.ShouldContain(Weekly.Page.AbsoluteUri.Replace("&", "&amp;", StringComparison.Ordinal));
        mail.Html.ShouldContain("list=weekly");
        mail.Html.ShouldContain("From your weekly emails (the Monday recap and the Thursday tip). Other emails stay as they are.");

        mail.Text.ShouldStartWith("The talk test.\n\nHi Naledi.\n\n" + tip.Body);
        mail.Text.ShouldContain("Open this week: https://taperday.run\n");
        mail.Text.ShouldContain("Stop your weekly emails (the Monday recap and the Thursday tip): " + Weekly.Page.AbsoluteUri);
        mail.Text.ShouldNotContain("<");
    }

    [Fact]
    public void A_personal_note_goes_under_the_tip_in_the_html_and_the_plain_text_and_is_absent_otherwise()
    {
        var tip = CoachingTipBank.Improving[0];
        var note = CoachingTipBank.StravaEasyNote(300, Easy, Units.Kilometres, 2, 2);
        var mail = CoachingTipEmail.Compose("naledi@example.com", tip, Thursday, "Naledi", Weekly, note: note);

        mail.Subject.ShouldBe("Your Taperday tip: Trust your plan's paces");
        mail.Html.ShouldContain("About your easy runs</h2>");
        mail.Html.ShouldContain(EmailLayout.Encode(note.Text));
        mail.Html.IndexOf("About your easy runs", StringComparison.Ordinal).ShouldBeGreaterThan(mail.Html.IndexOf(EmailLayout.Encode(tip.Body), StringComparison.Ordinal));
        mail.Text.ShouldContain(tip.Body + "\n\nAbout your easy runs\n" + note.Text + "\n\nOpen this week: https://taperday.run");

        var plain = CoachingTipEmail.Compose("naledi@example.com", tip, Thursday, "Naledi", Weekly);
        plain.Html.ShouldNotContain("About your easy runs");
        plain.Text.ShouldNotContain("About your easy runs");
    }

    [Fact]
    public void A_title_that_asks_keeps_its_question_mark_and_a_name_is_encoded()
    {
        var mail = CoachingTipEmail.Compose("a@example.com", CoachingTipBank.NewRunner[6], Thursday, "<b>Eve</b>", Weekly);
        mail.Subject.ShouldBe("Your Taperday tip: Sore or hurt?");
        mail.Html.ShouldContain("Sore or hurt?</h1>");
        mail.Html.ShouldContain("Hi &lt;b&gt;Eve&lt;/b&gt;.");
        CoachingTipEmail.Compose("a@example.com", CoachingTipBank.NewRunner[0], Thursday, "", Weekly).Html.ShouldContain("Hi there.");
    }

    [Fact]
    public void Previews_are_one_per_track_and_the_long_run_jump_made_up_marked_as_tests_with_no_unsubscribe_key()
    {
        var previews = CoachingTipEmail.Previews("maker@example.com", Thursday);
        previews.Select(p => p.Subject).ShouldBe(new[]
        {
            "[Test] Your Taperday tip: The talk test",
            "[Test] Your Taperday tip: Trust your plan's paces",
            "[Test] Your Taperday tip: Easy on the long-run jumps",
        });
        previews.ShouldAllBe(p => p.To == "maker@example.com" && p.Unsubscribe == null && p.Html.Contains("Hi Sample.", StringComparison.Ordinal));
        previews.ShouldAllBe(p => p.Html.Contains("Turn emails off in Account.", StringComparison.Ordinal) && p.Text.Contains("Turn emails off in Account: https://taperday.run/?view=account", StringComparison.Ordinal));
        previews[2].Text.ShouldContain("(14 km)");
    }

    [GeneratedRegex(@"[.?!](\s|$)")]
    private static partial Regex Sentences();
}
