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

    [Fact]
    public async Task Two_runs_swap_then_one_moves_again_and_a_restore_puts_the_week_back_as_written()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 2, 5, 0, 0, TimeSpan.Zero));
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Tuesday", "Thursday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 30, planFrom = "2026-10-19", version = 2 } }));
        var id = saved.GetProperty("id").GetGuid();
        var original = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        string TypeOn(JsonElement plan, string date) => Sessions(plan).Single(s => s.GetProperty("date").GetString() == date && s.GetProperty("type").GetString() != "Strength").GetProperty("type").GetString()!;
        var (tuesday, thursday) = (TypeOn(original, "2026-11-03"), TypeOn(original, "2026-11-05"));

        var offered = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/preview"), new { situation = "SwapRuns", date = "2026-11-03" }));
        offered.GetProperty("moveTargets").EnumerateArray().Select(t => t.GetString()).ShouldContain("2026-11-05");

        var swap = new { situation = "SwapRuns", date = "2026-11-03", moveTo = "2026-11-05" };
        var preview = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/preview"), swap));
        await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/apply"), new { change = swap, token = preview.GetProperty("token").GetString() }));
        var swapped = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        TypeOn(swapped, "2026-11-03").ShouldBe(thursday);
        TypeOn(swapped, "2026-11-05").ShouldBe(tuesday);

        // Reschedule again: Tuesday's session, now on Thursday, moves to Wednesday. One copy of it, and Thursday rests.
        var move = new { situation = "MoveRun", date = "2026-11-05", moveTo = "2026-11-04" };
        var moving = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/preview"), move));
        await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/life-happens/apply"), new { change = move, token = moving.GetProperty("token").GetString() }));
        var week = Sessions((await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan"))
            .Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-11-03") >= 0 && string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-11-05") <= 0 && s.GetProperty("type").GetString() != "Strength")
            .Select(s => (s.GetProperty("date").GetString(), s.GetProperty("type").GetString())).ToList();
        week.ShouldBe([("2026-11-03", thursday), ("2026-11-04", tuesday)]);

        var restored = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/adjustments/restore"), new { dates = new[] { "2026-11-03" } }));
        restored.GetProperty("plan").GetRawText().ShouldBe(original.GetRawText());
    }
}
