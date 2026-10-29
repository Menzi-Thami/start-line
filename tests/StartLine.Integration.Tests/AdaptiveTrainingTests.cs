using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace StartLine.Integration.Tests;

public sealed class AdaptiveTrainingTests
{
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); response.IsSuccessStatusCode.ShouldBeTrue(body); return JsonDocument.Parse(body).RootElement; }
    private static IEnumerable<JsonElement> Sessions(JsonElement plan) => plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray());
    private static async Task<(HttpClient Client, Guid Id, JsonElement Plan)> Ready(StartLineApiFactory factory)
    {
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 10, 28, 18, 0, 0, TimeSpan.Zero));
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Monday", "Tuesday", "Wednesday", "Friday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 40, planFrom = "2026-10-19", strengthDays = new[] { "Thursday" }, version = 2 } }));
        var id = saved.GetProperty("id").GetGuid();
        await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/additional/{Guid.NewGuid()}/2026-10-28/Easy"), new { status = "Done", actualSessionType = "Easy", distanceKm = 10, duration = "01:00:00" }));
        return (client, id, (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan"));
    }
    [Fact]
    public async Task Preview_is_read_only_and_accepted_changes_survive_reopening_without_rewriting_history()
    {
        await using var factory = new StartLineApiFactory(); var (client, id, original) = await Ready(factory);
        var preview = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/remaining-week/proposal")));
        preview.GetProperty("changes").GetArrayLength().ShouldBeGreaterThan(0);
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan").GetRawText().ShouldBe(original.GetRawText());
        var applied = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/remaining-week/apply"), new { token = preview.GetProperty("token").GetString() }));
        var reopened = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        reopened.GetRawText().ShouldBe(applied.GetProperty("proposed").GetRawText());
        Sessions(reopened).Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-10-28") <= 0 || s.GetProperty("type").GetString() == "Strength").Select(s => s.GetRawText())
            .ShouldBe(Sessions(original).Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-10-28") <= 0 || s.GetProperty("type").GetString() == "Strength").Select(s => s.GetRawText()));
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/remaining-week/proposal")))).GetProperty("changes").GetArrayLength().ShouldBe(0);
    }
    [Fact]
    public async Task New_runs_and_midnight_invalidate_review_and_other_runners_cannot_access_it()
    {
        await using var factory = new StartLineApiFactory(); var (client, id, _) = await Ready(factory);
        var first = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/remaining-week/proposal")));
        await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/additional/{Guid.NewGuid()}/2026-10-28/Recovery"), new { status = "Done", distanceKm = 2 }));
        (await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/remaining-week/apply"), new { token = first.GetProperty("token").GetString() })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var fresh = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/remaining-week/proposal"))); factory.Time.Advance(TimeSpan.FromDays(1));
        (await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/remaining-week/apply"), new { token = fresh.GetProperty("token").GetString() })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await factory.CreateClient().As(Guid.NewGuid().ToString()).GetAsync(Url($"/api/v1/me/plans/{id}/remaining-week/proposal"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
    [Fact]
    public async Task Personal_calendar_and_check_ins_use_the_accepted_easy_workout()
    {
        await using var factory = new StartLineApiFactory(); var (client, id, _) = await Ready(factory);
        var preview = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/remaining-week/proposal")));
        await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/remaining-week/apply"), new { token = preview.GetProperty("token").GetString() }));
        var token = (await Json(await client.GetAsync(Url("/api/v1/me/calendar")))).GetProperty("token").GetString();
        (await factory.CreateClient().GetStringAsync(Url($"/api/v1/calendar/{token}.ics"))).ShouldContain("SUMMARY:Easy run");
        factory.Time.Advance(TimeSpan.FromDays(2));
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/2026-10-30/Easy"), new { status = "Done" })).StatusCode.ShouldBe(HttpStatusCode.OK);
    }
    [Fact]
    public async Task Sunday_acceptance_changes_next_week_but_keeps_current_and_historical_paces()
    {
        await using var factory = new StartLineApiFactory(); var (client, id, original) = await Ready(factory);
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 19, 0, 0, TimeSpan.Zero));
        foreach (var session in Sessions(original).Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-10-26") >= 0 && string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-11-01") <= 0 && s.GetProperty("type").GetString() != "Strength"))
            await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/{session.GetProperty("date").GetString()}/{session.GetProperty("type").GetString()}"), new { status = "Done", effort = 10, distanceKm = session.GetProperty("distanceKm").GetDouble() }));
        var preview = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/coach/proposal?recovery=Tired")));
        preview.GetProperty("review").GetProperty("targetWeek").GetString().ShouldBe("2026-11-02"); preview.GetProperty("canApply").GetBoolean().ShouldBeTrue();
        var token = preview.GetProperty("token").GetString();
        (await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/coach/apply"), new { token, recovery = "Ready" })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/coach/apply"), new { token, recovery = "Tired" }));
        var reopened = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        reopened.GetProperty("paces").GetRawText().ShouldBe(original.GetProperty("paces").GetRawText());
        Sessions(reopened).Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-11-01") <= 0).Select(s => s.GetRawText()).ShouldBe(Sessions(original).Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-11-01") <= 0).Select(s => s.GetRawText()));
        factory.Time.Advance(TimeSpan.FromDays(1));
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan").GetProperty("paces").GetRawText().ShouldBe(preview.GetProperty("proposed").GetProperty("plan").GetProperty("paces").GetRawText());
    }
}
