using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Insights;

namespace StartLine.Integration.Tests;

/// <summary>
/// The "what's new" announcement against a real (disposable, local) SQL database, synthetic runners and a fake clock: only
/// runners who said yes to news and updates, whose account predates the release, get it, each exactly once, with a
/// failed send tried again. Emails land in a fake outbox; none leave the machine.
/// </summary>
public sealed class UpdateAnnouncementTests
{
    private static readonly AnnouncementBudget Unlimited = new(1000, 1000, 1_000_000);

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<(HttpClient Client, string Email)> Runner(OnboardingFactory factory, bool updates = true, bool withEmail = true)
    {
        var email = $"{Guid.NewGuid():N}@example.com";
        var client = factory.CreateClient().As(Guid.NewGuid().ToString(), withEmail ? email : null);
        var response = await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Naledi", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true, updateEmails = updates });
        response.IsSuccessStatusCode.ShouldBeTrue(await response.Content.ReadAsStringAsync());
        return (client, email);
    }

    private static async Task<AnnouncementRun> Send(OnboardingFactory factory, DateTimeOffset before, AnnouncementBudget? budget = null)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IUpdateAnnouncements>()
            .SendDueAsync(UpdateEmails.RedesignCampaign, before, factory.Time.GetUtcNow(), budget ?? Unlimited, CancellationToken.None);
    }

    [Fact]
    public async Task Goes_once_to_runners_who_want_updates_and_joined_before_the_release()
    {
        using var factory = new OnboardingFactory();
        var yes = await Runner(factory);
        var no = await Runner(factory, updates: false);
        var noAddress = await Runner(factory, withEmail: false);
        var release = factory.Time.GetUtcNow().AddMinutes(1);
        factory.Time.Advance(TimeSpan.FromMinutes(2));
        var later = await Runner(factory);

        await Send(factory, release);
        await Send(factory, release);

        var mail = factory.Mail.To(yes.Email).ShouldHaveSingleItem();
        mail.Subject.ShouldBe("Same training. A whole new Taperday.");
        mail.Text.ShouldContain("Hi Naledi,");
        mail.Unsubscribe.ShouldNotBeNull();
        factory.Mail.To(no.Email).ShouldBeEmpty();
        factory.Mail.To(noAddress.Email).ShouldBeEmpty();
        factory.Mail.To(later.Email).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_failed_send_is_tried_again_on_the_next_run()
    {
        using var factory = new OnboardingFactory();
        var runner = await Runner(factory);
        var release = factory.Time.GetUtcNow().AddMinutes(1);
        factory.Mail.FailuresFor[runner.Email] = 1;

        await Send(factory, release);
        factory.Mail.To(runner.Email).ShouldBeEmpty();

        await Send(factory, release);
        factory.Mail.To(runner.Email).ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Stops_at_the_days_budget()
    {
        using var factory = new OnboardingFactory();
        var first = await Runner(factory);
        var second = await Runner(factory);
        var release = factory.Time.GetUtcNow().AddMinutes(1);

        // Other tests share this database, so count only this test's runners against a budget of one per run.
        var run = await Send(factory, release, new AnnouncementBudget(MaxPerRun: 1, DailyLimit: 1000, DailyEmailBudget: 1_000_000));
        run.Sent.ShouldBeLessThanOrEqualTo(1);
        (factory.Mail.To(first.Email).Count + factory.Mail.To(second.Email).Count).ShouldBeLessThanOrEqualTo(1);
    }
}
