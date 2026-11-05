using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

/// <summary>Beginner programme belongs to the signed-in runner, never to a shared browser.</summary>
public sealed class BeginnerProgressTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<HttpClient> SignedUp(StartLineApiFactory server, string identity)
    {
        var client = server.CreateClient().As(identity);
        (await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Runner",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        })).EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task Saved_beginner_progress_survives_reload_but_is_private_to_its_runner()
    {
        const string endpoint = "/api/v1/me/beginner";
        var identity = Guid.NewGuid().ToString();
        using var client = await SignedUp(factory, identity);

        (await client.GetAsync(Url(endpoint))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var payload = new
        {
            startedOn = "2026-11-02",
            days = new[] { "Monday", "Wednesday", "Friday" },
            completed = new[] { "0:1:1" },
            week = 2,
            paused = false,
            revision = 0,
            weekDelays = new int[9],
            pausedOn = (string?)null,
        };
        var response = await client.PutAsJsonAsync(Url(endpoint), payload);
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var saved = await response.Content.ReadFromJsonAsync<JsonElement>();
        saved.GetProperty("completed").EnumerateArray().Single().GetString().ShouldBe("0:1:1");

        using var anotherSession = factory.CreateClient().As(identity);
        var reloaded = await anotherSession.GetFromJsonAsync<JsonElement>(Url(endpoint));
        reloaded.GetProperty("week").GetInt32().ShouldBe(2);
        reloaded.GetProperty("completed").GetArrayLength().ShouldBe(1);

        using var otherRunner = await SignedUp(factory, Guid.NewGuid().ToString());
        (await otherRunner.GetAsync(Url(endpoint))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await factory.CreateClient().GetAsync(Url(endpoint))).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }
}
