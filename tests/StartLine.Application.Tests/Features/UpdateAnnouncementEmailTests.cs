using StartLine.Application.Features.Insights;

namespace StartLine.Application.Tests.Features;

public sealed class UpdateAnnouncementEmailTests
{
    private static readonly UnsubscribeLinks Links = UnsubscribeLinks.For("token-123", new Uri("https://api.example.test"));

    [Fact]
    public void The_redesign_email_greets_the_runner_lists_what_is_new_and_offers_a_way_out_of_updates()
    {
        var mail = UpdateEmails.TaperdayRedesign("runner@example.test", "Thandi <b>", unsubscribe: Links);

        mail.Subject.ShouldBe("Fresh legs, fresh look: meet the new Taperday");
        mail.Html.ShouldContain("Hi Thandi &lt;b&gt;,");
        mail.Html.ShouldNotContain("<b>,");
        foreach (var what in new[] { "Five tabs, zero hunting", "Today, front and centre", "A plan you can read at a glance", "Progress gets its own lane", "Your race, found", "Night Run mode" })
        {
            mail.Html.ShouldContain(what);
            mail.Text.ShouldContain(what);
        }

        mail.Text.ShouldContain("exactly where you left them");
        mail.Text.ShouldContain(Links.Page.AbsoluteUri);
        mail.Unsubscribe.ShouldBe(Links);
    }

    [Fact]
    public void The_preview_is_marked_as_a_test_and_has_no_unsubscribe_link()
    {
        var mail = UpdateEmails.TaperdayRedesign("maker@example.test", test: true);
        mail.Subject.ShouldStartWith("[Test] ");
        mail.Html.ShouldContain("Hi there,");
        mail.Unsubscribe.ShouldBeNull();
    }

    [Fact]
    public void The_sign_in_outage_email_says_it_is_microsoft_what_to_do_and_that_nothing_is_lost()
    {
        var mail = UpdateEmails.SignInOutage("runner@example.test", "Thandi <b>", unsubscribe: Links);

        mail.Subject.ShouldBe("Not getting your Taperday sign-in code? Here's why");
        mail.Html.ShouldContain("Hi Thandi &lt;b&gt;,");
        mail.Html.ShouldNotContain("<b>,");
        foreach (var what in new[] { "sent by Microsoft", "Already signed in? Stay that way", "Continue with Google", "give it a little time", "all safe" })
        {
            mail.Html.ShouldContain(what);
            mail.Text.ShouldContain(what);
        }

        mail.Text.ShouldContain(Links.Page.AbsoluteUri);
        mail.Unsubscribe.ShouldBe(Links);
    }

    [Theory]
    [InlineData(UpdateEmails.RedesignCampaign, "Fresh legs")]
    [InlineData(UpdateEmails.SignInOutageCampaign, "sign-in code")]
    public void Every_campaign_has_a_preview_marked_as_a_test_without_a_way_out(string campaign, string subject)
    {
        var mail = UpdateEmails.Preview(campaign, "maker@example.test").ShouldNotBeNull();
        mail.Subject.ShouldStartWith("[Test] ");
        mail.Subject.ShouldContain(subject);
        mail.Unsubscribe.ShouldBeNull();
        IUpdateAnnouncements.Campaigns.ShouldContain(campaign);
    }

    [Fact]
    public void An_unknown_campaign_has_no_preview() => UpdateEmails.Preview("no-such-campaign", "maker@example.test").ShouldBeNull();

    [Theory]
    [InlineData(0, 0, 0, 25)]
    [InlineData(0, 200, 40, 10)]
    [InlineData(195, 0, 0, 5)]
    [InlineData(0, 260, 0, 0)]
    public void The_budget_leaves_room_for_every_other_email_and_the_recap(int announcements, int others, int recapReserve, int allowed) =>
        AnnouncementBudget.Default.Allowance(announcements, others, recapReserve).ShouldBe(allowed);
}
