using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

public sealed class PersonalCalendarTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private const string DayPrefix = "DTSTART;VALUE=DATE:";

    private static readonly string[] RunDays = ["Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday"];

    private static readonly object ComradesPlan = new
    {
        raceSlug = "comrades-2027",
        goalTime = "10:30:00",
        runDays = RunDays,
        longRunDay = "Sunday",
        currentWeeklyKm = 40,
    };

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<HttpClient> SignedUp(string units = "Kilometres")
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Thandi",
            timeZone = "Africa/Johannesburg",
            units,
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        })).EnsureSuccessStatusCode();
        return client;
    }

    private static async Task Save(HttpClient client, object plan) =>
        (await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan, replaceCurrent = true })).EnsureSuccessStatusCode();

    private static async Task<string> Token(HttpClient client)
    {
        var response = await client.GetAsync(Url("/api/v1/me/calendar"));
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        return (await Json(response)).GetProperty("token").GetString()!;
    }

    // No sign-in headers: calendar apps can't sign in.
    private Task<HttpResponseMessage> Feed(string token) => factory.CreateClient().GetAsync(Url($"/api/v1/calendar/{token}.ics"));

    private static string FirstRunDay(string ics) =>
        ics.Split("\r\n").First(l => l.StartsWith(DayPrefix, StringComparison.Ordinal))[DayPrefix.Length..];

    [Fact]
    public async Task A_runner_gets_one_link_and_the_same_one_after()
    {
        var client = await SignedUp();

        var token = await Token(client);

        token.Length.ShouldBe(43);
        token.ShouldMatch("^[A-Za-z0-9_-]+$");
        (await Token(client)).ShouldBe(token);
    }

    [Fact]
    public async Task Two_first_requests_at_once_get_the_same_link()
    {
        var client = await SignedUp();

        var tokens = await Task.WhenAll(Token(client), Token(client));

        tokens[1].ShouldBe(tokens[0]);
        (await Token(client)).ShouldBe(tokens[0]);
    }

    [Fact]
    public async Task Someone_who_hasnt_signed_up_gets_no_link()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());

        (await client.GetAsync(Url("/api/v1/me/calendar"))).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await factory.CreateClient().GetAsync(Url("/api/v1/me/calendar"))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_feed_serves_the_current_plan_to_anyone_with_the_link()
    {
        var client = await SignedUp();
        await Save(client, ComradesPlan);

        var response = await Feed(await Token(client));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.ShouldBe("text/calendar");
        response.Headers.CacheControl!.Public.ShouldBeTrue();
        response.Headers.CacheControl.MaxAge.ShouldBe(TimeSpan.FromHours(1));
        var ics = (await response.Content.ReadAsStringAsync()).Replace("\r\n ", "", StringComparison.Ordinal);
        ics.ShouldStartWith("BEGIN:VCALENDAR\r\n");
        ics.ShouldContain("X-WR-CALNAME:Taperday: Comrades Marathon\r\n");
        ics.ShouldContain(DayPrefix + "20270613");
        ics.ShouldContain("/km");
    }

    [Fact]
    public async Task The_same_link_follows_the_plan_when_it_changes()
    {
        var client = await SignedUp();
        await Save(client, ComradesPlan);
        var token = await Token(client);
        var before = FirstRunDay(await (await Feed(token)).Content.ReadAsStringAsync());

        await Save(client, new
        {
            raceSlug = "comrades-2027",
            goalTime = "10:30:00",
            runDays = RunDays,
            longRunDay = "Sunday",
            currentWeeklyKm = 40,
            startOn = "2027-01-13",
        });
        var after = FirstRunDay(await (await Feed(token)).Content.ReadAsStringAsync());

        before.ShouldBe("20261229");
        after.ShouldBe("20270113");
    }

    [Fact]
    public async Task A_runner_with_no_current_plan_gets_an_empty_calendar_that_stays_subscribed()
    {
        var client = await SignedUp();

        var response = await Feed(await Token(client));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var ics = await response.Content.ReadAsStringAsync();
        ics.ShouldStartWith("BEGIN:VCALENDAR\r\n");
        ics.ShouldContain("X-WR-CALNAME:Taperday\r\n");
        ics.ShouldNotContain("BEGIN:VEVENT");
        ics.ShouldEndWith("END:VCALENDAR\r\n");
    }

    [Fact]
    public async Task Shows_distances_and_paces_in_the_runners_own_units()
    {
        var client = await SignedUp(units: "Miles");
        await Save(client, ComradesPlan);

        var ics = (await (await Feed(await Token(client))).Content.ReadAsStringAsync()).Replace("\r\n ", "", StringComparison.Ordinal);

        ics.ShouldContain("/mi");
        ics.ShouldNotContain("/km");
    }

    [Fact]
    public async Task Resetting_gives_a_new_link_and_the_old_one_stops_working()
    {
        var client = await SignedUp();
        await Save(client, ComradesPlan);
        var old = await Token(client);

        var response = await client.PostAsync(Url("/api/v1/me/calendar/reset"), null);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var fresh = (await Json(response)).GetProperty("token").GetString()!;
        fresh.ShouldNotBe(old);
        (await Token(client)).ShouldBe(fresh);
        (await Feed(old)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Feed(fresh)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    [InlineData("short")]
    public async Task An_unknown_link_is_not_found_and_the_answer_never_repeats_it(string token)
    {
        var response = await Feed(token);

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        response.Content.Headers.ContentType!.MediaType.ShouldBe("application/problem+json");
        (await Json(response)).GetProperty("detail").GetString()!.ShouldNotContain(token);
    }

    [Fact]
    public async Task Deleting_the_account_stops_the_link()
    {
        var client = await SignedUp();
        await Save(client, ComradesPlan);
        var token = await Token(client);

        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await Feed(token)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task The_export_never_contains_the_link()
    {
        var client = await SignedUp();
        await Save(client, ComradesPlan);
        var token = await Token(client);

        var export = await (await client.GetAsync(Url("/api/v1/me/export"))).Content.ReadAsStringAsync();

        export.ShouldNotContain(token);
        export.ShouldNotContain("calendarToken", Case.Insensitive);
    }
}
