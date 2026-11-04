using StartLine.Application.Features.Insights;

namespace StartLine.Application.Tests.Onboarding;

public sealed class UiRefreshAnnouncementTests
{
    private static readonly UnsubscribeLinks Links = UnsubscribeLinks.For("KEY", new Uri("https://api.example.test"));

    [Fact]
    public void Runner_copy_has_release_focused_words_and_update_unsubscribe()
    {
        var mail = UiRefreshAnnouncement.Compose("runner@example.com", unsubscribe: Links);
        mail.Subject.ShouldBe(UiRefreshAnnouncement.Subject);
        mail.To.ShouldBe("runner@example.com");
        mail.Unsubscribe.ShouldBe(Links);
        mail.Html.ShouldContain("Same training. A whole new view.");
        mail.Html.ShouldContain("Your week, at a glance");
        mail.Html.ShouldContain("Your plan and the runs you’ve recorded stay yours");
        mail.Html.ShouldContain(Links.Page.AbsoluteUri.Replace("&", "&amp;", StringComparison.Ordinal));
        mail.Html.ShouldNotContain("Before Taperday weekly schedule screenshot");
        mail.Text.ShouldContain("Unsubscribe from Taperday news and updates:");
    }

    [Fact]
    public void Preview_is_marked_test_and_does_not_claim_images_without_approved_assets()
    {
        var mail = UiRefreshAnnouncement.Compose("maker@example.com", test: true,
            beforeImageUrl: "https://random.example/before.png",
            afterImageUrl: "https://taperday.run/email/ui-refresh/after.png");
        mail.Subject.ShouldStartWith("[Test] ");
        mail.Unsubscribe.ShouldBeNull();
        mail.Html.ShouldNotContain("See the difference");
        mail.Text.ShouldNotContain("Before: ");
    }

    [Fact]
    public void Approved_first_party_screenshot_pair_includes_before_after_with_text_fallback()
    {
        var mail = UiRefreshAnnouncement.Compose("maker@example.com", test: true,
            beforeImageUrl: "https://taperday.run/email/ui-refresh/before.png",
            afterImageUrl: "https://taperday.run/email/ui-refresh/after.png");
        mail.Html.ShouldContain("Before Taperday weekly schedule screenshot");
        mail.Html.ShouldContain("After Taperday weekly schedule screenshot");
        mail.Text.ShouldContain("Before: https://taperday.run/email/ui-refresh/before.png");
        mail.Text.ShouldContain("After: https://taperday.run/email/ui-refresh/after.png");
    }
}
