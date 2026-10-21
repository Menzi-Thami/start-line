using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;
using DateTime = System.DateTime;

namespace StartLine.Integration.Tests;

public sealed class PrivacyConsentTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static readonly DateTime Morning = new(2026, 10, 9, 3, 0, 0, DateTimeKind.Utc);

    private static readonly object ParkrunPlan = new
    {
        raceName = "Parkrun PB",
        distanceKm = 5,
        raceDate = "2026-12-13",
        goalTime = "00:24:30",
        runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 20,
    };

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static object Profile(bool? heartRateConsent) => new
    {
        displayName = "Sipho",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
        heartRateConsent,
    };

    private async Task<HttpClient> SignedUp(bool? heartRateConsent)
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile(heartRateConsent))).EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<JsonElement> Upload(HttpClient client, DateTime start)
    {
        var content = new MultipartFormDataContent();
        var bytes = new ByteArrayContent(FitFiles.Run(start, 5000, 300));
        bytes.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(bytes, "file", "run.fit");
        var response = await client.PostAsync(Url("/api/v1/me/activities"), content);
        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return await Json(response);
    }

    private static void ShouldHaveNoHeartRate(JsonElement run)
    {
        run.GetProperty("averageHeartRate").ValueKind.ShouldBe(JsonValueKind.Null);
        run.GetProperty("maxHeartRate").ValueKind.ShouldBe(JsonValueKind.Null);
        run.GetProperty("heartRate").ValueKind.ShouldBe(JsonValueKind.Null);
        run.GetProperty("splits").EnumerateArray().ShouldAllBe(s => s.GetProperty("averageHeartRate").ValueKind == JsonValueKind.Null);
    }

    /// <summary>Puts the runner back on an older notice, as everyone who signed up before this one is.</summary>
    private async Task OnTheOldNotice(HttpClient client, bool heartRateConsent)
    {
        var id = (await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me"))).GetProperty("id").GetGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        await db.Database.ExecuteSqlAsync(
            $"UPDATE Runners SET PrivacyNoticeVersion = '2026-10-09', HeartRateConsent = {heartRateConsent} WHERE Id = {id}");
    }

    [Fact]
    public void The_notice_version_moved_on_when_runs_and_heart_rate_were_added() =>
        Application.Features.Account.PrivacyNotice.CurrentVersion.ShouldBe("2026-10-21");

    [Fact]
    public async Task Without_heart_rate_consent_a_run_is_kept_with_no_heart_rate_at_all()
    {
        var client = await SignedUp(heartRateConsent: null);

        var me = await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me"));
        me.GetProperty("heartRateConsent").GetBoolean().ShouldBeFalse();
        me.GetProperty("needsPrivacyConsent").GetBoolean().ShouldBeFalse();
        var run = await Upload(client, Morning);

        ShouldHaveNoHeartRate(run);
        run.GetProperty("distanceKm").GetDouble().ShouldBe(5, tolerance: 0.01);
        ShouldHaveNoHeartRate((await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me/export"))).GetProperty("activities")[0]);
    }

    [Fact]
    public async Task With_heart_rate_consent_heart_rate_is_kept_and_withdrawing_it_deletes_it()
    {
        var client = await SignedUp(heartRateConsent: true);
        var run = await Upload(client, Morning);
        run.GetProperty("averageHeartRate").GetInt32().ShouldBe(150);

        var withdrawn = await client.PutAsJsonAsync(Url("/api/v1/me"), Profile(heartRateConsent: false));

        (await Json(withdrawn)).GetProperty("heartRateConsent").GetBoolean().ShouldBeFalse();
        var id = run.GetProperty("id").GetGuid();
        ShouldHaveNoHeartRate(await client.GetFromJsonAsync<JsonElement>(Url($"/api/v1/me/activities/{id}")));
        // Gone from storage too, not just hidden: the export lists everything held.
        ShouldHaveNoHeartRate((await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me/export"))).GetProperty("activities")[0]);
    }

    [Fact]
    public async Task Saving_the_profile_without_saying_leaves_heart_rate_consent_as_it_was()
    {
        var client = await SignedUp(heartRateConsent: true);

        var saved = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), Profile(heartRateConsent: null)));

        saved.GetProperty("heartRateConsent").GetBoolean().ShouldBeTrue();
    }

    [Fact]
    public async Task A_runner_on_an_older_notice_must_accept_the_new_one_before_adding_anything()
    {
        var client = await SignedUp(heartRateConsent: true);
        await OnTheOldNotice(client, heartRateConsent: false);

        (await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me"))).GetProperty("needsPrivacyConsent").GetBoolean().ShouldBeTrue();
        var plan = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ParkrunPlan });
        plan.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await Json(plan)).GetProperty("code").GetString().ShouldBe("privacy_notice_outdated");
        var content = new MultipartFormDataContent { { new ByteArrayContent(FitFiles.Run(Morning, 5000, 300)), "file", "run.fit" } };
        (await client.PostAsync(Url("/api/v1/me/activities"), content)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        // Reading, exporting and deleting never wait on the notice.
        (await client.GetAsync(Url("/api/v1/me/plans"))).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await client.GetAsync(Url("/api/v1/me/export"))).StatusCode.ShouldBe(HttpStatusCode.OK);

        var accepted = await Json(await client.PutAsJsonAsync(Url("/api/v1/me/privacy"), new { heartRateConsent = true }));

        accepted.GetProperty("needsPrivacyConsent").GetBoolean().ShouldBeFalse();
        accepted.GetProperty("privacyNoticeVersion").GetString().ShouldBe("2026-10-21");
        accepted.GetProperty("heartRateConsent").GetBoolean().ShouldBeTrue();
        (await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ParkrunPlan })).StatusCode.ShouldBe(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Heart_rate_kept_from_before_consent_was_asked_for_is_hidden_then_deleted_if_the_answer_is_no()
    {
        var client = await SignedUp(heartRateConsent: true);
        var id = (await Upload(client, Morning)).GetProperty("id").GetGuid();
        await OnTheOldNotice(client, heartRateConsent: false);

        ShouldHaveNoHeartRate(await client.GetFromJsonAsync<JsonElement>(Url($"/api/v1/me/activities/{id}")));
        (await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me/export"))).GetProperty("activities")[0]
            .GetProperty("averageHeartRate").GetInt32().ShouldBe(150);

        (await client.PutAsJsonAsync(Url("/api/v1/me/privacy"), new { heartRateConsent = false })).EnsureSuccessStatusCode();

        ShouldHaveNoHeartRate((await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me/export"))).GetProperty("activities")[0]);
    }

    [Fact]
    public async Task Accepting_needs_a_signed_up_runner() =>
        (await factory.CreateClient().As(Guid.NewGuid().ToString()).PutAsJsonAsync(Url("/api/v1/me/privacy"), new { heartRateConsent = false }))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);
}
