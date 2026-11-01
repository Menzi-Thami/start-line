using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
namespace StartLine.Integration.Tests;

/// <summary>Daily readiness check-ins: kept on the account, changed or cleared, private, and heard by the weekly review.</summary>
public sealed class ReadinessTests
{
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); response.IsSuccessStatusCode.ShouldBeTrue(body); return JsonDocument.Parse(body).RootElement; }
    private static IEnumerable<JsonElement> Sessions(JsonElement plan) => plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray());

    private static async Task<HttpClient> Runner(StartLineApiFactory factory)
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        return client;
    }

    [Fact]
    public async Task A_day_is_logged_changed_listed_newest_first_and_cleared_and_stays_private()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 6, 0, 0, TimeSpan.Zero));
        var client = await Runner(factory);

        await Json(await client.PutAsJsonAsync(Url("/api/v1/me/readiness/2026-10-31"), new { feeling = "Fresh", sleep = "Good" }));
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me/readiness/2026-11-01"), new { feeling = "Tired", soreness = "Some", note = "  Heavy legs after the long run  " }));
        var changed = await Json(await client.PutAsJsonAsync(Url("/api/v1/me/readiness/2026-11-01"), new { feeling = "Okay", soreness = "Some", note = "Heavy legs after the long run" }));
        changed.GetProperty("feeling").GetString().ShouldBe("Okay");

        var days = (await Json(await client.GetAsync(Url("/api/v1/me/readiness")))).EnumerateArray().ToList();
        days.Select(d => d.GetProperty("date").GetString()).ShouldBe(["2026-11-01", "2026-10-31"]);
        days[0].GetProperty("note").GetString().ShouldBe("Heavy legs after the long run");
        days[1].GetProperty("sleep").GetString().ShouldBe("Good");

        // Not the future, nor further back than two weeks.
        (await client.PutAsJsonAsync(Url("/api/v1/me/readiness/2026-11-02"), new { feeling = "Fresh" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await client.PutAsJsonAsync(Url("/api/v1/me/readiness/2026-10-18"), new { feeling = "Fresh" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        (await client.DeleteAsync(Url("/api/v1/me/readiness/2026-10-31"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.DeleteAsync(Url("/api/v1/me/readiness/2026-10-31"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Json(await client.GetAsync(Url("/api/v1/me/readiness")))).GetArrayLength().ShouldBe(1);
        (await Json(await client.GetAsync(Url("/api/v1/me/export")))).GetProperty("readiness").GetArrayLength().ShouldBe(1);

        var stranger = await Runner(factory);
        (await Json(await stranger.GetAsync(Url("/api/v1/me/readiness")))).GetArrayLength().ShouldBe(0);
        (await stranger.DeleteAsync(Url("/api/v1/me/readiness/2026-11-01"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Json(await client.GetAsync(Url("/api/v1/me/readiness")))).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task The_weekly_review_hears_todays_check_in_when_the_runner_doesnt_answer_there()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 10, 28, 18, 0, 0, TimeSpan.Zero));
        var client = await Runner(factory);
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Monday", "Tuesday", "Wednesday", "Friday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 40, planFrom = "2026-10-19", version = 2 } }));
        var id = saved.GetProperty("id").GetGuid();
        var plan = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 1, 19, 0, 0, TimeSpan.Zero));
        foreach (var session in Sessions(plan).Where(s => string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-10-26") >= 0 && string.CompareOrdinal(s.GetProperty("date").GetString(), "2026-11-01") <= 0 && s.GetProperty("type").GetString() != "Strength"))
            await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/{session.GetProperty("date").GetString()}/{session.GetProperty("type").GetString()}"), new { status = "Done", effort = 5, distanceKm = session.GetProperty("distanceKm").GetDouble() }));

        var unanswered = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/coach/proposal")))).GetProperty("review");
        unanswered.GetProperty("recovery").GetString().ShouldBe("NotReported");
        unanswered.GetProperty("recoveryFromCheckIn").GetBoolean().ShouldBeFalse();

        await Json(await client.PutAsJsonAsync(Url("/api/v1/me/readiness/2026-11-01"), new { feeling = "Unwell" }));
        var heard = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/coach/proposal")))).GetProperty("review");
        heard.GetProperty("recovery").GetString().ShouldBe("Unwell");
        heard.GetProperty("recoveryFromCheckIn").GetBoolean().ShouldBeTrue();

        // An answer in the review itself wins.
        var answered = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/coach/proposal?recovery=Ready")))).GetProperty("review");
        answered.GetProperty("recovery").GetString().ShouldBe("Ready");
        answered.GetProperty("recoveryFromCheckIn").GetBoolean().ShouldBeFalse();

        // "Okay" says nothing either way.
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me/readiness/2026-11-01"), new { feeling = "Okay" }));
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/coach/proposal")))).GetProperty("review").GetProperty("recovery").GetString().ShouldBe("NotReported");
    }
}
