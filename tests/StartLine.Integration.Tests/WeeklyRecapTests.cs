using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StartLine.Application.Features.Insights;

namespace StartLine.Integration.Tests;

/// <summary>An app whose emails land in a list instead of Brevo, and can be made to fail for one address.</summary>
public sealed class RecapFactory : StartLineApiFactory
{
    public Outbox Mail { get; } = new();

    protected override void ConfigureServices(IServiceCollection services)
    {
        services.RemoveAll<IEmailSender>();
        services.AddSingleton<IEmailSender>(Mail);
    }

    public sealed class Outbox : IEmailSender
    {
        public ConcurrentBag<EmailMessage> Sent { get; } = [];

        public ConcurrentDictionary<string, int> FailuresFor { get; } = new();

        public bool Configured => true;

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
        {
            if (FailuresFor.TryGetValue(message.To, out var left) && left > 0)
            {
                FailuresFor[message.To] = left - 1;
                throw new HttpRequestException("Brevo said no.");
            }

            Sent.Add(message);
            return Task.CompletedTask;
        }

        public List<EmailMessage> To(string address) => [.. Sent.Where(m => m.To == address)];
    }
}

/// <summary>
/// The weekly recap: 19:00 on each runner's own Sunday, about the week ending that day, once per runner and week whatever runs it,
/// retried after a failure, and with a link that stops the recap and nothing else.
/// </summary>
public sealed class WeeklyRecapTests
{
    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); response.IsSuccessStatusCode.ShouldBeTrue(body); return JsonDocument.Parse(body).RootElement; }

    private static async Task<(HttpClient Client, string Email)> Runner(RecapFactory factory, string timeZone, bool weekly = true)
    {
        var email = $"{Guid.NewGuid():N}@example.com";
        var client = factory.CreateClient().As(Guid.NewGuid().ToString(), email);
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Naledi", timeZone, units = "Kilometres", weeklyEmails = weekly, acceptPrivacyNotice = true }));
        return (client, email);
    }

    private static async Task<int> SendDue(RecapFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IWeeklyRecaps>().SendDueAsync(factory.Time.GetUtcNow(), CancellationToken.None);
    }

    [Fact]
    public async Task Each_runner_gets_it_once_at_seven_on_their_own_Sunday_evening_with_the_weeks_running_and_the_week_ahead()
    {
        await using var factory = new RecapFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 10, 28, 18, 0, 0, TimeSpan.Zero));
        var (joburg, joburgEmail) = await Runner(factory, "Africa/Johannesburg");
        var (_, londonEmail) = await Runner(factory, "Europe/London");
        var (_, optedOut) = await Runner(factory, "Africa/Johannesburg", weekly: false);
        var plan = await Json(await joburg.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Monday", "Wednesday", "Friday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 30, planFrom = "2026-10-19", version = 2 } }));
        await Json(await joburg.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan.GetProperty("id").GetGuid()}/check-ins/additional/{Guid.NewGuid()}/2026-10-28/Easy"), new { status = "Done", actualSessionType = "Easy", distanceKm = 10, duration = "01:00:00" }));

        // Sunday afternoon: nobody's 19:00 yet (18:30 in Johannesburg).
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 16, 30, 0, TimeSpan.Zero));
        await SendDue(factory);
        factory.Mail.To(joburgEmail).ShouldBeEmpty();

        // 19:30 in Johannesburg, 17:30 in London.
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 17, 30, 0, TimeSpan.Zero));
        await SendDue(factory);
        await SendDue(factory);
        var recap = factory.Mail.To(joburgEmail).ShouldHaveSingleItem();
        factory.Mail.To(londonEmail).ShouldBeEmpty();
        recap.Subject.ShouldBe("Your Taperday week");
        recap.Html.ShouldContain("10 km over 1 run.");
        recap.Html.ShouldContain("26 Oct – 1 Nov");
        recap.Html.ShouldContain("The week ahead");
        recap.Text.ShouldContain("Mon 2 Nov");

        // 19:05 in London: their turn, and Johannesburg's isn't sent again.
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 19, 5, 0, TimeSpan.Zero));
        await SendDue(factory);
        factory.Mail.To(londonEmail).ShouldHaveSingleItem().Html.ShouldContain("A quiet week.");
        factory.Mail.To(joburgEmail).Count.ShouldBe(1);
        factory.Mail.To(optedOut).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_failed_send_is_tried_again_and_then_left_alone()
    {
        await using var factory = new RecapFactory();
        var (_, email) = await Runner(factory, "Africa/Johannesburg");
        factory.Mail.FailuresFor[email] = 1;
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 18, 0, 0, TimeSpan.Zero));

        await SendDue(factory);
        factory.Mail.To(email).ShouldBeEmpty();
        await SendDue(factory);
        factory.Mail.To(email).ShouldHaveSingleItem();
        await SendDue(factory);
        factory.Mail.To(email).Count.ShouldBe(1);
    }

    [Fact]
    public async Task The_recaps_link_stops_the_recap_and_leaves_update_emails_on()
    {
        await using var factory = new RecapFactory();
        var (client, email) = await Runner(factory, "Africa/Johannesburg");
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 18, 0, 0, TimeSpan.Zero));
        await SendDue(factory);
        var links = factory.Mail.To(email).ShouldHaveSingleItem().Unsubscribe.ShouldNotBeNull();
        links.Page.Query.ShouldContain("list=weekly");

        var token = Uri.UnescapeDataString(links.OneClick.Query.Split("t=")[1]);
        (await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token })).EnsureSuccessStatusCode();
        var me = await Json(await client.GetAsync(Url("/api/v1/me")));
        me.GetProperty("weeklyEmails").GetBoolean().ShouldBeFalse();
        me.GetProperty("updateEmails").GetBoolean().ShouldBeTrue();

        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 8, 18, 0, 0, TimeSpan.Zero));
        await SendDue(factory);
        factory.Mail.To(email).Count.ShouldBe(1);
    }
}
