using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

/// <summary>
/// The run/walk choice through the API: refused when it isn't one of the three, kept with a saved plan and in the account
/// export, and Auto stored as no choice at all.
/// </summary>
public sealed class RunWalkTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static readonly object Profile = new
    {
        displayName = "Lindiwe",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    private static Dictionary<string, object?> Marathon(string? runWalk) => new()
    {
        ["raceName"] = "Autumn Marathon",
        ["distanceKm"] = 42.195,
        ["raceDate"] = "2027-03-14",
        ["goalTime"] = "04:15:00",
        ["runDays"] = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        ["longRunDay"] = "Sunday",
        ["currentWeeklyKm"] = 30,
        ["version"] = 3,
        ["runWalk"] = runWalk,
    };

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static IEnumerable<JsonElement> Sessions(JsonElement plan) =>
        plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray());

    [Theory]
    [InlineData("\"sometimes\"")]
    [InlineData("7")]
    public async Task A_run_walk_choice_that_is_not_one_of_the_three_is_refused(string junk)
    {
        var body = JsonSerializer.Serialize(Marathon(null)).Replace("\"runWalk\":null", $"\"runWalk\":{junk}", StringComparison.Ordinal);
        using var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");

        var response = await factory.CreateClient().PostAsync(Url("/api/v1/plans"), content);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_shared_plan_with_run_walk_on_carries_the_ratio_on_its_long_runs_and_race_day()
    {
        var plan = await Json(await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"), Marathon("On")));

        var race = Sessions(plan).Single(s => s.GetProperty("type").GetString() == "Race");
        race.GetProperty("runWalk").GetProperty("walkSeconds").GetInt32().ShouldBe(30);
        Sessions(plan).Where(s => s.GetProperty("type").GetString() == "Easy")
            .ShouldAllBe(s => s.GetProperty("runWalk").ValueKind == JsonValueKind.Null);
    }

    [Fact]
    public async Task A_saved_plan_keeps_its_run_walk_choice_and_the_export_includes_it()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Marathon("Off") });
        saved.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await Json(saved)).GetProperty("id").GetGuid();

        var reopened = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        reopened.GetProperty("inputs").GetProperty("runWalk").GetString().ShouldBe("Off");
        Sessions(reopened.GetProperty("plan")).ShouldAllBe(s => s.GetProperty("runWalk").ValueKind == JsonValueKind.Null);

        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        export.GetProperty("plans")[0].GetProperty("inputs").GetProperty("runWalk").GetString().ShouldBe("Off");

        // Auto is the default, so it is saved as no choice: one way to say it, as in a plan link.
        var auto = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { replaceCurrent = true, plan = Marathon("Auto") });
        auto.EnsureSuccessStatusCode();
        var autoId = (await Json(auto)).GetProperty("id").GetGuid();
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{autoId}"))))
            .GetProperty("inputs").GetProperty("runWalk").ValueKind.ShouldBe(JsonValueKind.Null);
    }
}
