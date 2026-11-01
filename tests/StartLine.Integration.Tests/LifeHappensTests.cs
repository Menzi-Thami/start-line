using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace StartLine.Integration.Tests;

/// <summary>Life Happens through the API: preview, apply only what was previewed, and restore the plan as written.</summary>
public sealed class LifeHappensTests
{
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); response.IsSuccessStatusCode.ShouldBeTrue(body); return JsonDocument.Parse(body).RootElement; }
    private static IEnumerable<JsonElement> Sessions(JsonElement plan) => plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray());

    [Fact]
    public async Task Moving_the_long_run_is_previewed_applied_once_and_restored_whole()
    {
        await using var factory = new StartLineApiFactory();
        // Monday 2 November, before any of the week's runs.
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 2, 5, 0, 0, TimeSpan.Zero));
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Tuesday", "Thursday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 30, planFrom = "2026-10-19", version = 2 } }));
        var id = saved.GetProperty("id").GetGuid();
        var original = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        var longRun = Sessions(original).Single(s => s.GetProperty("date").GetString() == "2026-11-08");

        var offered = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/preview"), new { situation = "MoveLongRun" }));
        var targets = offered.GetProperty("moveTargets").EnumerateArray().Select(t => t.GetString()!).ToList();
        targets.ShouldNotBeEmpty();
        var to = targets[0];

        var change = new { situation = "MoveLongRun", moveTo = to };
        var preview = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/preview"), change));
        preview.GetProperty("changes").GetArrayLength().ShouldBe(2);
        Sessions(preview.GetProperty("proposed")).ShouldContain(s => s.GetProperty("date").GetString() == to && s.GetProperty("type").GetString() == longRun.GetProperty("type").GetString());
        // A preview changes nothing.
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan").GetRawText().ShouldBe(original.GetRawText());

        (await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/apply"), new { change, token = new string('0', 64) })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/apply"), new { change, token = preview.GetProperty("token").GetString() }));
        var moved = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        Sessions(moved).ShouldContain(s => s.GetProperty("date").GetString() == to && s.GetProperty("distanceKm").GetDouble() == longRun.GetProperty("distanceKm").GetDouble());
        Sessions(moved).ShouldNotContain(s => s.GetProperty("date").GetString() == "2026-11-08");

        var restored = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/adjustments/restore"), new { dates = new[] { to } }));
        restored.GetProperty("plan").GetRawText().ShouldBe(original.GetRawText());

        (await factory.CreateClient().As(Guid.NewGuid().ToString()).PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/preview"), change)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}
