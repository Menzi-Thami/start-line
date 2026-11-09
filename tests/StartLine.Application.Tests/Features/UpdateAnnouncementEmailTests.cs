using StartLine.Application.Features.Insights;

namespace StartLine.Application.Tests.Features;

public sealed class UpdateAnnouncementEmailTests
{
    private static readonly UnsubscribeLinks Links = UnsubscribeLinks.For("token-123", new Uri("https://api.example.test"));

    [Fact]
    public void The_redesign_email_greets_the_runner_lists_what_is_new_and_offers_a_way_out_of_updates()
    {
        var mail = UpdateEmails.TaperdayRedesign("runner@example.test", "Thandi <b>", unsubscribe: Links);

        mail.Subject.ShouldBe("Same training. A whole new Taperday.");
        mail.Html.ShouldContain("Hi Thandi &lt;b&gt;,");
        mail.Html.ShouldNotContain("<b>,");
        foreach (var what in new[] { "Everything in one tap", "A clearer plan", "Progress has its own page", "Find your race", "Night Run dark mode" })
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

    [Theory]
    [InlineData(0, 0, 0, 25)]
    [InlineData(0, 200, 40, 10)]
    [InlineData(195, 0, 0, 5)]
    [InlineData(0, 260, 0, 0)]
    public void The_budget_leaves_room_for_every_other_email_and_the_recap(int announcements, int others, int recapReserve, int allowed) =>
        AnnouncementBudget.Default.Allowance(announcements, others, recapReserve).ShouldBe(allowed);
}
