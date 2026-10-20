using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Sync;
using StartLine.Domain.Sync;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

public sealed class StravaSyncTests(StravaApiFactory factory) : IClassFixture<StravaApiFactory>
{
    private static readonly object Profile = new
    {
        displayName = "Thandi",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    private static readonly object ComradesPlan = new
    {
        raceSlug = "comrades-2027",
        goalTime = "10:30:00",
        runDays = new[] { "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 40,
    };

    private static long nextAthlete = 50_000;

    private DateTimeOffset Now => factory.Time.GetUtcNow();

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        return JsonDocument.Parse(body).RootElement;
    }

    private static string Hook => $"/api/v1/webhooks/strava/{StravaApiFactory.HookSecret}";

    private async Task<HttpClient> SignedUp()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>Signs up and connects a new Strava athlete the way the web app does: authorize, then the callback.</summary>
    private async Task<(HttpClient Client, long Athlete)> Connected(string scope = "read,activity:read_all")
    {
        var client = await SignedUp();
        var athlete = Interlocked.Increment(ref nextAthlete);
        var authorize = await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);
        var connected = await client.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(athlete), state, scope });
        (await Json(connected)).GetProperty("connected").GetBoolean().ShouldBeTrue();
        return (client, athlete);
    }

    private static async Task<JsonElement> Runs(HttpClient client) => await Json(await client.GetAsync(Url("/api/v1/me/activities")));

    private Task<HttpResponseMessage> Push(long athlete, string objectType, long objectId, string aspect, object? updates = null, long? subscription = null) =>
        factory.CreateClient().PostAsJsonAsync(Url(Hook), new Dictionary<string, object?>
        {
            ["object_type"] = objectType,
            ["object_id"] = objectId,
            ["aspect_type"] = aspect,
            ["owner_id"] = athlete,
            ["subscription_id"] = subscription ?? StravaApiFactory.SubscriptionId,
            ["event_time"] = Now.ToUnixTimeSeconds(),
            ["updates"] = updates ?? new { },
        });

    [Fact]
    public async Task Connecting_backfills_six_weeks_of_runs_and_skips_older_runs_and_rides()
    {
        var client = await SignedUp();
        var athlete = Interlocked.Increment(ref nextAthlete);
        factory.Strava.AddRun(athlete, Now.AddDays(-3));
        factory.Strava.AddRun(athlete, Now.AddDays(-40), metres: 12_000);
        factory.Strava.AddRun(athlete, Now.AddDays(-50));
        factory.Strava.AddRun(athlete, Now.AddDays(-2), sportType: "Ride");

        var authorize = await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(athlete), state, scope = "read,activity:read_all" }));
        await factory.SyncAsync();

        var runs = await Runs(client);
        runs.GetArrayLength().ShouldBe(2);
        runs[0].GetProperty("source").GetProperty("kind").GetString().ShouldBe("Strava");
        runs[0].GetProperty("source").GetProperty("viewUrl").GetString().ShouldStartWith("https://www.strava.com/activities/");
        runs[0].GetProperty("source").GetProperty("recordedOnGarmin").GetBoolean().ShouldBeTrue();
        runs[1].GetProperty("distanceKm").GetDouble().ShouldBe(12, tolerance: 0.01);

        var status = await Json(await client.GetAsync(Url("/api/v1/me/sync/strava")));
        status.GetProperty("syncedRuns").GetInt32().ShouldBe(2);
        status.GetProperty("includesPrivateRuns").GetBoolean().ShouldBeTrue();
        status.GetProperty("pending").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task A_pushed_run_is_judged_against_the_plan_session_for_that_day_like_an_upload()
    {
        var (client, athlete) = await Connected();
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ComradesPlan }));
        var plan = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{saved.GetProperty("id").GetGuid()}")));
        var session = plan.GetProperty("plan").GetProperty("weeks").EnumerateArray()
            .SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .First(s => s.GetProperty("type").GetString() != "Strength");
        var day = DateOnly.Parse(session.GetProperty("date").GetString()!, CultureInfo.InvariantCulture);
        var id = factory.Strava.AddRun(athlete, new DateTimeOffset(day.ToDateTime(new TimeOnly(3, 0)), TimeSpan.Zero));

        (await Push(athlete, "activity", id, "create")).StatusCode.ShouldBe(HttpStatusCode.OK);
        await factory.SyncAsync();

        var run = (await Runs(client))[0];
        run.GetProperty("plannedTitle").GetString().ShouldBe(session.GetProperty("title").GetString());
        run.GetProperty("pace").GetString().ShouldBeOneOf("Faster", "OnTarget", "Slower", "NoTarget");
        var detail = await Json(await client.GetAsync(Url($"/api/v1/me/activities/{run.GetProperty("id").GetGuid()}")));
        detail.GetProperty("plan").GetProperty("actualKm").GetDouble().ShouldBe(8, tolerance: 0.01);
        detail.GetProperty("splits").GetArrayLength().ShouldBe(8);
    }

    [Fact]
    public async Task One_sync_pass_matches_each_runner_against_their_own_plan()
    {
        // The worker records runs for several runners in one pass; each must be judged against their own plans.
        var (first, firstAthlete) = await Connected();
        var (second, secondAthlete) = await Connected();
        await factory.SyncAsync();
        var saved = await Json(await first.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ComradesPlan }));
        var plan = await Json(await first.GetAsync(Url($"/api/v1/me/plans/{saved.GetProperty("id").GetGuid()}")));
        var session = plan.GetProperty("plan").GetProperty("weeks").EnumerateArray()
            .SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .First(s => s.GetProperty("type").GetString() != "Strength");
        var start = new DateTimeOffset(DateOnly.Parse(session.GetProperty("date").GetString()!, CultureInfo.InvariantCulture).ToDateTime(new TimeOnly(3, 0)), TimeSpan.Zero);

        await Push(firstAthlete, "activity", factory.Strava.AddRun(firstAthlete, start), "create");
        await Push(secondAthlete, "activity", factory.Strava.AddRun(secondAthlete, start), "create");
        await factory.SyncAsync();

        (await Runs(first))[0].GetProperty("plannedTitle").GetString().ShouldBe(session.GetProperty("title").GetString());
        (await Runs(second))[0].GetProperty("plannedTitle").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task The_same_event_twice_is_fetched_once()
    {
        var (client, athlete) = await Connected();
        await factory.SyncAsync();
        var id = factory.Strava.AddRun(athlete, Now.AddHours(-2));

        await Push(athlete, "activity", id, "create");
        await Push(athlete, "activity", id, "update", new { title = "Morning run" });
        var reads = factory.Strava.Calls.Count(c => c == $"activity {id}");
        await factory.SyncAsync();

        (factory.Strava.Calls.Count(c => c == $"activity {id}") - reads).ShouldBe(1);
        (await Runs(client)).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task Deleting_a_run_on_strava_deletes_the_copy()
    {
        var (client, athlete) = await Connected();
        var id = factory.Strava.AddRun(athlete, Now.AddDays(-1));
        await factory.SyncAsync();
        (await Runs(client)).GetArrayLength().ShouldBe(1);

        factory.Strava.Delete(id);
        await Push(athlete, "activity", id, "delete");
        await factory.SyncAsync();

        (await Runs(client)).GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task Revoking_taperday_on_strava_deletes_every_synced_run_and_the_connection()
    {
        var (client, athlete) = await Connected();
        factory.Strava.AddRun(athlete, Now.AddDays(-1));
        await factory.SyncAsync();

        factory.Strava.Revoke(athlete);
        await Push(athlete, "athlete", athlete, "update", new { authorized = "false" });
        await factory.SyncAsync();

        (await Runs(client)).GetArrayLength().ShouldBe(0);
        (await Json(await client.GetAsync(Url("/api/v1/me/sync/strava")))).GetProperty("connected").GetBoolean().ShouldBeFalse();
    }

    [Fact]
    public async Task Events_for_another_subscription_or_an_unknown_athlete_are_ignored()
    {
        var (client, athlete) = await Connected();
        await factory.SyncAsync();
        var id = factory.Strava.AddRun(athlete, Now.AddHours(-1));

        (await Push(athlete, "activity", id, "create", subscription: 1)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Push(999_999_999, "activity", id, "create")).StatusCode.ShouldBe(HttpStatusCode.OK);
        await factory.SyncAsync();

        (await Runs(client)).GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task A_wrong_hook_secret_looks_like_any_unknown_url()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/webhooks/strava/guess"), new { object_type = "activity" });

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Strava_validating_the_callback_gets_its_challenge_back_only_with_the_right_token()
    {
        var client = factory.CreateClient();

        var ok = await client.GetAsync(Url($"{Hook}?hub.mode=subscribe&hub.challenge=15f7d1a91c1f40f8a748fd134752feb3&hub.verify_token={StravaApiFactory.VerifyToken}"));
        var wrong = await client.GetAsync(Url($"{Hook}?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=nope"));

        (await Json(ok)).GetProperty("hub.challenge").GetString().ShouldBe("15f7d1a91c1f40f8a748fd134752feb3");
        wrong.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Disconnecting_revokes_at_strava_deletes_synced_runs_keeps_uploads_and_confirms()
    {
        var (client, athlete) = await Connected();
        factory.Strava.AddRun(athlete, Now.AddDays(-1));
        factory.Strava.AddRun(athlete, Now.AddDays(-2));
        await factory.SyncAsync();

        var response = await Json(await client.DeleteAsync(Url("/api/v1/me/sync/strava")));

        response.GetProperty("deletedRuns").GetInt32().ShouldBe(2);
        factory.Strava.Deauthorized.ShouldContain(athlete);
        (await Runs(client)).GetArrayLength().ShouldBe(0);
        (await Json(await client.GetAsync(Url("/api/v1/me/sync/strava")))).GetProperty("connected").GetBoolean().ShouldBeFalse();
    }

    [Fact]
    public async Task A_synced_copy_lapses_after_seven_days_unless_it_is_fetched_again()
    {
        var (client, athlete) = await Connected();
        factory.Strava.AddRun(athlete, Now.AddDays(-1));
        await factory.SyncAsync();
        var first = (await Runs(client))[0];
        var cachedUntil = first.GetProperty("source").GetProperty("cachedUntil").GetDateTimeOffset();
        cachedUntil.ShouldBe(Now.AddDays(7));

        // A day later the daily refresh is due but nothing needs fetching yet; five days on, the run is fetched again.
        factory.Time.Advance(TimeSpan.FromDays(1));
        await factory.SyncAsync();
        factory.Time.Advance(TimeSpan.FromDays(4));
        await factory.SyncAsync();

        var refreshed = (await Runs(client))[0];
        refreshed.GetProperty("id").GetGuid().ShouldBe(first.GetProperty("id").GetGuid());
        refreshed.GetProperty("source").GetProperty("cachedUntil").GetDateTimeOffset().ShouldBeGreaterThan(cachedUntil);
    }

    [Fact]
    public async Task A_copy_that_could_not_be_refreshed_is_hidden_at_seven_days_and_then_deleted()
    {
        var (client, athlete) = await Connected();
        factory.Strava.AddRun(athlete, Now.AddDays(-1));
        await factory.SyncAsync();

        // Access is revoked at Strava without telling Taperday, so every refresh fails. A week of daily passes:
        factory.Strava.Revoke(athlete);
        for (var day = 1; day <= 7; day++)
        {
            factory.Time.Advance(TimeSpan.FromDays(1));
            if (day == 7)
            {
                // Hidden the moment it lapses, before the worker has even run.
                (await Runs(client)).GetArrayLength().ShouldBe(0);
            }

            await factory.SyncAsync();
        }

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.Activities.CountAsync(a => a.CachedUntil != null && a.CachedUntil <= Now)).ShouldBe(0);
        (await Json(await client.GetAsync(Url("/api/v1/me/sync/strava")))).GetProperty("status").GetString().ShouldBe("NeedsReconnect");
    }

    [Fact]
    public async Task Uploading_the_file_of_a_synced_run_replaces_the_copy_and_a_later_sync_leaves_the_upload_alone()
    {
        var (client, athlete) = await Connected();
        var start = new DateTimeOffset(2026, 10, 7, 3, 0, 0, TimeSpan.Zero);
        var id = factory.Strava.AddRun(athlete, start, metres: 10_000, secondsPerKm: 300);
        await factory.SyncAsync();

        var bytes = new ByteArrayContent(FitFiles.Run(start.UtcDateTime, 10_000, 300));
        bytes.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
        using var file = new MultipartFormDataContent { { bytes, "file", "run.fit" } };
        (await client.PostAsync(Url("/api/v1/me/activities"), file)).StatusCode.ShouldBe(HttpStatusCode.Created);
        await Push(athlete, "activity", id, "update", new { title = "Edited" });
        await factory.SyncAsync();

        var runs = await Runs(client);
        runs.GetArrayLength().ShouldBe(1);
        runs[0].GetProperty("source").GetProperty("kind").GetString().ShouldBe("Upload");
    }

    [Fact]
    public async Task Tokens_are_stored_encrypted_and_never_exported()
    {
        var (client, athlete) = await Connected();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            var connection = await db.ProviderConnections.SingleAsync(c => c.ExternalAthleteId == athlete);
            connection.AccessToken.ShouldNotContain("access-");
            connection.RefreshToken.ShouldNotContain("refresh-");
        }

        var export = await client.GetStringAsync(Url("/api/v1/me/export"));
        export.ShouldNotContain($"access-{athlete}");
        export.ShouldNotContain($"refresh-{athlete}");
        var connections = JsonDocument.Parse(export).RootElement.GetProperty("connections");
        connections[0].GetProperty("externalAthleteId").GetInt64().ShouldBe(athlete);
        connections[0].GetProperty("provider").GetString().ShouldBe("Strava");
    }

    [Fact]
    public async Task An_expiring_access_token_is_refreshed_and_the_rotated_refresh_token_is_kept()
    {
        factory.Strava.TokenLifetime = TimeSpan.FromMinutes(3);
        var (client, athlete) = await Connected();
        factory.Strava.TokenLifetime = TimeSpan.FromHours(6);
        factory.Strava.AddRun(athlete, Now.AddDays(-1));

        await factory.SyncAsync();

        (await Runs(client)).GetArrayLength().ShouldBe(1);
        factory.Strava.Calls.ShouldContain("refresh");
    }

    [Fact]
    public async Task Deleting_the_account_revokes_strava_and_removes_the_connection()
    {
        var (client, athlete) = await Connected();
        factory.Strava.AddRun(athlete, Now.AddDays(-1));
        await factory.SyncAsync();

        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        factory.Strava.Deauthorized.ShouldContain(athlete);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.ProviderConnections.AnyAsync(c => c.ExternalAthleteId == athlete)).ShouldBeFalse();
    }

    [Fact]
    public async Task A_strava_account_connects_to_one_taperday_account_only()
    {
        var (_, athlete) = await Connected();
        var other = await SignedUp();
        var authorize = await Json(await other.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);

        var response = await other.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(athlete), state, scope = "read,activity:read_all" });

        response.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task A_connect_link_started_by_one_runner_cannot_finish_on_another_account()
    {
        var first = await SignedUp();
        var authorize = await Json(await first.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);
        var second = await SignedUp();

        var response = await second.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(Interlocked.Increment(ref nextAthlete)), state, scope = "read,activity:read_all" });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Without_permission_to_read_runs_connecting_is_refused()
    {
        var client = await SignedUp();
        var authorize = await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);

        var response = await client.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(Interlocked.Increment(ref nextAthlete)), state, scope = "read" });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task When_the_rate_limit_is_nearly_spent_background_work_waits_for_the_next_window()
    {
        var (client, athlete) = await Connected();
        await factory.SyncAsync();
        var gate = factory.Services.GetRequiredService<StravaRateGate>();
        gate.Record(new ApiUsage(95, 100, 100, 1000));
        var id = factory.Strava.AddRun(athlete, Now.AddHours(-1));

        await Push(athlete, "activity", id, "create");
        await factory.SyncAsync();
        (await Runs(client)).GetArrayLength().ShouldBe(0);

        factory.Time.Advance(TimeSpan.FromMinutes(15));
        gate.Record(new ApiUsage(0, 100, 100, 1000));
        await factory.SyncAsync();
        (await Runs(client)).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task A_failed_read_is_retried_a_minute_later()
    {
        var (client, athlete) = await Connected();
        await factory.SyncAsync();
        var id = factory.Strava.AddRun(athlete, Now.AddHours(-1));
        factory.Strava.FailNextRead = new StravaUnavailableException("Strava answered 503");

        await Push(athlete, "activity", id, "create");
        await factory.SyncAsync();
        (await Runs(client)).GetArrayLength().ShouldBe(0);
        (await Json(await client.GetAsync(Url("/api/v1/me/sync/strava")))).GetProperty("pending").GetInt32().ShouldBe(1);

        factory.Time.Advance(TimeSpan.FromMinutes(1));
        await factory.SyncAsync();
        (await Runs(client)).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task Opening_the_plan_catches_up_on_runs_strava_never_pushed()
    {
        var (client, athlete) = await Connected();
        await factory.SyncAsync();
        factory.Time.Advance(TimeSpan.FromMinutes(11));
        factory.Strava.AddRun(athlete, Now.AddHours(-1));

        await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/catch-up"), null));
        await factory.SyncAsync();

        (await Runs(client)).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task Personal_bests_include_synced_runs()
    {
        var (client, athlete) = await Connected();
        factory.Strava.AddRun(athlete, Now.AddDays(-2), metres: 5000, secondsPerKm: 280);
        factory.Strava.AddRun(athlete, Now.AddDays(-1), metres: 5000, secondsPerKm: 300);
        await factory.SyncAsync();

        var bests = await Json(await client.GetAsync(Url("/api/v1/me/activities/bests")));

        var fiveK = bests.EnumerateArray().Single(b => b.GetProperty("distanceMetres").GetDouble() == 5000);
        fiveK.GetProperty("seconds").GetDouble().ShouldBe(1400, tolerance: 1);
        fiveK.GetProperty("source").GetString().ShouldBe("Strava");
    }
}

public sealed class StravaSwitchedOffTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    [Fact]
    public async Task Without_a_strava_app_configured_the_feature_reports_unavailable()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(new Uri("/api/v1/me", UriKind.Relative), new { displayName = "Sam", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }))
            .EnsureSuccessStatusCode();

        var status = JsonDocument.Parse(await client.GetStringAsync(new Uri("/api/v1/me/sync/strava", UriKind.Relative))).RootElement;
        var authorize = await client.PostAsync(new Uri("/api/v1/me/sync/strava/authorize", UriKind.Relative), null);

        status.GetProperty("available").GetBoolean().ShouldBeFalse();
        authorize.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }
}
