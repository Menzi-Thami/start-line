using StartLine.Application.Features.Insights;
using StartLine.Application.Features.Onboarding;
using StartLine.Domain.Runners;

namespace StartLine.Application.Tests.Onboarding;

/// <summary>The onboarding emails' words, look, links and way out, for each cohort, and the made-up preview.</summary>
public sealed class OnboardingEmailTests
{
    private static readonly UnsubscribeLinks Links = UnsubscribeLinks.For("KEY", new Uri("https://api.example.test"));

    [Theory]
    [InlineData(OnboardingCampaign.StartPlan, "Your starting line is waiting", "https://taperday.run/?view=build", "Build my training plan")]
    [InlineData(OnboardingCampaign.FirstRun, "Your first run is waiting", "https://taperday.run/?view=home", "Open my plan")]
    [InlineData(OnboardingCampaign.ReturnToRunning, "Ready when you are", "https://taperday.run/?view=home", "Pick up my plan")]
    public void Each_email_greets_by_first_name_links_to_the_app_and_unsubscribes_from_updates_only(OnboardingCampaign campaign, string subject, string link, string button)
    {
        var mail = OnboardingEmail.Compose("naledi@example.com", campaign, "Naledi Dlamini", Links);

        mail.Subject.ShouldBe(subject);
        mail.To.ShouldBe("naledi@example.com");
        mail.Unsubscribe.ShouldBe(Links);
        mail.Html.ShouldContain("Hi Naledi.");
        mail.Html.ShouldNotContain("Dlamini");
        mail.Html.ShouldContain($"href=\"{link}\"");
        mail.Html.ShouldContain(button);
        mail.Html.ShouldContain("/email/wordmark.png");
        mail.Html.ShouldContain(Links.Page.AbsoluteUri.Replace("&", "&amp;", StringComparison.Ordinal));
        mail.Html.ShouldContain("From Taperday news and updates. Other emails stay as they are.");
        mail.Html.ShouldNotContain("list=weekly");
        mail.Html.ShouldContain("<html lang=\"en-GB\">");

        mail.Text.ShouldStartWith(subject + ".");
        mail.Text.ShouldContain("Hi Naledi.");
        mail.Text.ShouldContain($"{button}: {link}");
        mail.Text.ShouldContain("Unsubscribe from Taperday news and updates (other emails stay as they are): " + Links.Page.AbsoluteUri);
        mail.Text.ShouldNotContain("<");
    }

    [Fact]
    public void The_no_run_emails_never_say_the_runner_isnt_running()
    {
        OnboardingEmail.Compose("a@example.com", OnboardingCampaign.FirstRun, "A", Links).Text.ShouldContain("Already been out?");
        OnboardingEmail.Compose("a@example.com", OnboardingCampaign.ReturnToRunning, "A", Links).Text.ShouldContain("If you've been running elsewhere");
    }

    [Theory]
    [InlineData(null, "Hi there.")]
    [InlineData("   ", "Hi there.")]
    [InlineData("someone@example.com", "Hi there.")]
    [InlineData("  Thabo  ", "Hi Thabo.")]
    public void A_missing_or_email_like_name_falls_back_to_a_plain_greeting(string? name, string greeting)
    {
        OnboardingEmail.Compose("a@example.com", OnboardingCampaign.StartPlan, name, Links).Text.ShouldContain(greeting);
    }

    [Fact]
    public void A_name_is_encoded_in_the_html()
    {
        OnboardingEmail.Compose("a@example.com", OnboardingCampaign.StartPlan, "<b>Eve</b>", Links).Html.ShouldContain("Hi &lt;b&gt;Eve&lt;/b&gt;.");
    }

    [Fact]
    public void Previews_are_made_up_marked_as_tests_and_carry_no_unsubscribe_key()
    {
        foreach (var campaign in Enum.GetValues<OnboardingCampaign>())
        {
            var preview = OnboardingEmail.Preview("maker@example.com", campaign);
            preview.Subject.ShouldBe("[Test] " + OnboardingEmail.Subject(campaign));
            preview.Unsubscribe.ShouldBeNull();
            preview.Html.ShouldContain("Hi Sample.");
            preview.Html.ShouldContain("Turn emails off in Account.");
            preview.Text.ShouldContain("Turn emails off in Account: https://taperday.run/?view=account");
        }
    }
}
