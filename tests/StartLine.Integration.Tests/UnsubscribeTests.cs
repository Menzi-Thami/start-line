using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Insights;
using StartLine.Infrastructure.Email;

namespace StartLine.Integration.Tests;

/// <summary>
/// Unsubscribing from Taperday's news and update emails: from the link in an email (Taperday's own page posts the key),
/// from a mail app's one-click button (a form post to the List-Unsubscribe address), and back on from Account.
/// </summary>
public sealed class UnsubscribeTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static object Profile(bool? updateEmails = null) => new
    {
        displayName = "Naledi",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
        updateEmails,
    };

    /// <summary>A new runner with an email address, signed in, and the key their update emails would carry.</summary>
    private async Task<(HttpClient Client, string Email, string Token)> Runner()
    {
        var email = $"{Guid.NewGuid():N}@example.com";
        var client = factory.CreateClient().As(Guid.NewGuid().ToString(), email);
        var me = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), Profile()));
        var token = factory.Services.GetRequiredService<IUnsubscribeTokens>().Issue(me.GetProperty("id").GetGuid());
        return (client, email, token);
    }

    private static async Task<bool> GetsUpdates(HttpClient client) =>
        (await Json(await client.GetAsync(Url("/api/v1/me")))).GetProperty("updateEmails").GetBoolean();

    [Fact]
    public async Task The_link_in_an_email_turns_update_emails_off_and_saying_it_twice_is_fine()
    {
        var (client, _, token) = await Runner();
        (await GetsUpdates(client)).ShouldBeTrue();
        var anonymous = factory.CreateClient();

        (await anonymous.PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var me = await Json(await client.GetAsync(Url("/api/v1/me")));
        me.GetProperty("updateEmails").GetBoolean().ShouldBeFalse();
        var offAt = me.GetProperty("updateEmailsOffAt").GetDateTimeOffset();

        (await anonymous.PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Json(await client.GetAsync(Url("/api/v1/me")))).GetProperty("updateEmailsOffAt").GetDateTimeOffset().ShouldBe(offAt);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-real-key")]
    public async Task A_broken_or_tampered_key_is_a_400(string token)
    {
        var response = await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_mail_apps_one_click_unsubscribe_works()
    {
        var (client, _, token) = await Runner();
        var oneClick = UnsubscribeLinks.For(token, new Uri("https://api.example.test")).OneClick;
        using var form = new FormUrlEncodedContent(new Dictionary<string, string> { ["List-Unsubscribe"] = "One-Click" });

        var response = await factory.CreateClient().PostAsync(Url(oneClick.PathAndQuery), form);

        response.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await GetsUpdates(client)).ShouldBeFalse();
    }

    [Fact]
    public async Task Account_turns_update_emails_back_on_and_saving_without_the_choice_leaves_it_alone()
    {
        var (client, _, token) = await Runner();
        (await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token })).EnsureSuccessStatusCode();

        // An older app saves the profile without the choice: it must not quietly subscribe them again.
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile())).EnsureSuccessStatusCode();
        (await GetsUpdates(client)).ShouldBeFalse();

        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile(updateEmails: true))).EnsureSuccessStatusCode();
        (await GetsUpdates(client)).ShouldBeTrue();
        (await Json(await client.GetAsync(Url("/api/v1/me/export")))).GetProperty("profile").GetProperty("updateEmails").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task A_broadcast_goes_only_to_runners_who_get_updates_each_with_their_own_way_out()
    {
        var (_, staying, _) = await Runner();
        var (_, leaving, leavingToken) = await Runner();
        (await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token = leavingToken })).EnsureSuccessStatusCode();

        await using var scope = factory.Services.CreateAsyncScope();
        var emails = await scope.ServiceProvider.GetRequiredService<UpdateBroadcast>().RacePlanV3Async(CancellationToken.None);

        emails.ShouldNotContain(e => e.To == leaving);
        var email = emails.Single(e => e.To == staying);
        email.Unsubscribe.ShouldNotBeNull();
        email.Html.ShouldContain(email.Unsubscribe.Page.AbsoluteUri.Replace("&", "&amp;", StringComparison.Ordinal));
        email.Text.ShouldContain(email.Unsubscribe.Page.AbsoluteUri);
        var key = Uri.UnescapeDataString(email.Unsubscribe.OneClick.Query.Split("t=")[1]);
        factory.Services.GetRequiredService<IUnsubscribeTokens>().Read(key).ShouldNotBe(Guid.Empty);

        var headers = BrevoEmailSender.Headers(email.Unsubscribe)!;
        headers["List-Unsubscribe"].ShouldBe($"<{email.Unsubscribe.OneClick.AbsoluteUri}>, <mailto:hello@taperday.run?subject=unsubscribe>");
        headers["List-Unsubscribe-Post"].ShouldBe("List-Unsubscribe=One-Click");
    }

    [Fact]
    public void An_email_without_unsubscribe_links_has_no_headers_or_footer_link()
    {
        var preview = UpdateEmails.RacePlanV3("maker@example.com", test: true);

        BrevoEmailSender.Headers(preview.Unsubscribe).ShouldBeNull();
        preview.Html.ShouldNotContain("Unsubscribe");
    }
}

/// <summary>The unsubscribe key on its own: no database, no app.</summary>
public sealed class UnsubscribeTokenTests
{
    private readonly DataProtectionUnsubscribeTokens tokens = new(new EphemeralDataProtectionProvider());

    [Fact]
    public void A_key_reads_back_as_its_runner()
    {
        var runner = Guid.NewGuid();

        tokens.Read(tokens.Issue(runner)).ShouldBe(runner);
    }

    [Fact]
    public void A_tampered_key_is_refused()
    {
        var token = tokens.Issue(Guid.NewGuid());
        var tampered = string.Concat(token.AsSpan(0, token.Length - 2), token.EndsWith("AA", StringComparison.Ordinal) ? "BB" : "AA");

        Should.Throw<ValidationException>(() => tokens.Read(tampered));
        Should.Throw<ValidationException>(() => tokens.Read("not-a-real-key"));
    }

    [Fact]
    public void A_key_for_something_else_on_the_same_key_ring_is_refused()
    {
        var provider = new EphemeralDataProtectionProvider();
        var other = provider.CreateProtector("StartLine.Push.Ticks.v1").Protect($"u1|{Guid.NewGuid():N}");

        Should.Throw<ValidationException>(() => new DataProtectionUnsubscribeTokens(provider).Read(other));
    }

    [Fact]
    public void A_key_still_works_long_after_it_was_issued()
    {
        // No expiry is written into it, so there's nothing for time to run out: an email read next year still unsubscribes.
        var runner = Guid.NewGuid();
        var payload = new EphemeralDataProtectionProvider();
        var token = new DataProtectionUnsubscribeTokens(payload).Issue(runner);

        payload.CreateProtector("StartLine.Email.Unsubscribe.v1").Unprotect(token).ShouldBe($"u1|{runner:N}");
    }
}
