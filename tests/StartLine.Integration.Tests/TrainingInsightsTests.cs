using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace StartLine.Integration.Tests;

public sealed class TrainingInsightsTests
{
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); response.IsSuccessStatusCode.ShouldBeTrue(body); return JsonDocument.Parse(body).RootElement; }
    private static IEnumerable<JsonElement> Sessions(JsonElement plan) => plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray());

    /// <summary>A runner on Sunday 1 November with last week fully checked in, hard, so the coach has a call to offer.</summary>
    private static async Task<(HttpClient Client, Guid Id, JsonElement Plan)> Reviewed(StartLineApiFactory factory)
    {
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 10, 28, 18, 0, 0, TimeSpan.Zero));
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Monday", "Tuesday", "Wednesday", "Friday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 40, planFrom = "2026-10-19", strengthDays = new[] { "Thursday" }, version = 2 } }));
        var id = saved.GetProperty("id").GetGuid();
        var plan = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 19, 0, 0, TimeSpan.Zero));
        foreach (var session in Sessions(plan).Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-10-26") >= 0 && string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-11-01") <= 0 && s.GetProperty("type").GetString() != "Strength"))
            await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/{session.GetProperty("date").GetString()}/{session.GetProperty("type").GetString()}"), new { status = "Done", effort = 10, distanceKm = session.GetProperty("distanceKm").GetDouble() }));
        return (client, id, plan);
    }

    [Fact]
    public async Task Declining_keeps_the_plan_and_both_answers_are_kept_newest_first()
    {
        await using var factory = new StartLineApiFactory(); var (client, id, _) = await Reviewed(factory);
        var before = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan").GetRawText();
        var preview = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/coach/proposal?recovery=Tired")));
        preview.GetProperty("canApply").GetBoolean().ShouldBeTrue();
        var token = preview.GetProperty("token").GetString();

        (await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/coach/decline"), new { token = new string('0', 64), recovery = "Tired" })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/coach/decline"), new { token, recovery = "Tired" }));
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan").GetRawText().ShouldBe(before);

        // Declining doesn't close the door: the runner can review again and accept.
        var again = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/coach/proposal?recovery=Tired")));
        await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/coach/apply"), new { token = again.GetProperty("token").GetString(), recovery = "Tired" }));

        var decisions = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/insights")))).GetProperty("decisions").EnumerateArray().ToList();
        decisions.Select(d => d.GetProperty("outcome").GetString()).ShouldBe(["Accepted", "Declined"]);
        decisions.ShouldAllBe(d => d.GetProperty("weekStart").GetString() == "2026-11-02" && d.GetProperty("recovery").GetString() == "Tired");
        decisions[0].GetProperty("reasons").EnumerateArray().Select(r => r.GetString()).ShouldContain("RecoveryFatigue");

        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        export.GetProperty("coachingDecisions").GetArrayLength().ShouldBe(2);
    }

    [Fact]
    public async Task Insights_show_eight_weeks_of_load_and_consistency_and_are_private()
    {
        await using var factory = new StartLineApiFactory(); var (client, id, _) = await Reviewed(factory);
        var response = await client.GetAsync(Url($"/api/v1/me/plans/{id}/insights"));
        response.Headers.CacheControl?.NoStore.ShouldBeTrue();
        var insights = await Json(response);
        insights.GetProperty("today").GetString().ShouldBe("2026-11-01");
        var trends = insights.GetProperty("trends");
        var weeks = trends.GetProperty("weeks").EnumerateArray().ToList();
        weeks.Count.ShouldBe(8);
        weeks[^1].GetProperty("weekStart").GetString().ShouldBe("2026-10-26");
        weeks[^1].GetProperty("ranKm").GetDouble().ShouldBeGreaterThan(0);
        weeks[^1].GetProperty("isCurrent").GetBoolean().ShouldBeTrue();
        // Two weeks of a plan: too little history for a load verdict, and the week before last was never logged.
        trends.GetProperty("load").GetProperty("signal").GetString().ShouldBe("NotEnoughHistory");
        trends.GetProperty("adherence").GetProperty("unlogged").GetInt32().ShouldBeGreaterThan(0);
        trends.GetProperty("gaps").EnumerateArray().Select(g => g.GetString()).ShouldContain("UnloggedSessions");
        insights.GetProperty("decisions").GetArrayLength().ShouldBe(0);

        (await factory.CreateClient().As(Guid.NewGuid().ToString()).GetAsync(Url($"/api/v1/me/plans/{id}/insights"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await factory.CreateClient().As(Guid.NewGuid().ToString()).PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/coach/decline"), new { token = new string('0', 64) })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}
