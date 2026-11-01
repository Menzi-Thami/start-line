using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using StartLine.Application.Features.Sync;
using DateTime = System.DateTime;

namespace StartLine.Integration.Tests;

/// <summary>Run data quality: provenance, near-duplicates, skipped and failed syncs, the totals breakdown, export and delete.</summary>
[Collection(StravaInSeries.Name)]
public sealed class RunDataTests(StravaApiFactory factory) : IClassFixture<StravaApiFactory>
{
    private static readonly object Profile = new
    {
        displayName = "Thandi",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
        heartRateConsent = true,
    };

    private static long nextAthlete = 70_000;

    private DateTimeOffset Now => factory.Time.GetUtcNow();

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        return JsonDocument.Parse(body).RootElement;
    }

    private async Task<HttpClient> SignedUp()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, long Athlete)> Connected()
    {
        var client = await SignedUp();
        var athlete = Interlocked.Increment(ref nextAthlete);
        var authorize = await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(athlete), state, scope = "read,activity:read_all" }));
        await factory.SyncAsync();
        return (client, athlete);
    }

    private Task<HttpResponseMessage> Push(long athlete, long objectId) =>
        factory.CreateClient().PostAsJsonAsync(Url($"/api/v1/webhooks/strava/{StravaApiFactory.HookSecret}"), new Dictionary<string, object?>
        {
            ["object_type"] = "activity",
            ["object_id"] = objectId,
            ["aspect_type"] = "create",
            ["owner_id"] = athlete,
            ["subscription_id"] = StravaApiFactory.SubscriptionId,
            ["event_time"] = Now.ToUnixTimeSeconds(),
            ["updates"] = new { },
        });

    private static Task<HttpResponseMessage> Upload(HttpClient client, byte[] file, string name = "run.fit")
    {
        var content = new MultipartFormDataContent();
        var bytes = new ByteArrayContent(file);
        bytes.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(bytes, "file", name);
        return client.PostAsync(Url("/api/v1/me/activities"), content);
    }

    private static async Task<JsonElement> Uploaded(HttpClient client, byte[] file, string name = "run.fit")
    {
        var response = await Upload(client, file, name);
        response.StatusCode.ShouldBe(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return await Json(response);
    }

    private static async Task<JsonElement> RunData(HttpClient client) => await Json(await client.GetAsync(Url("/api/v1/me/run-data")));

    private static async Task<JsonElement> Runs(HttpClient client) => await Json(await client.GetAsync(Url("/api/v1/me/activities")));

    [Fact]
    public async Task An_upload_keeps_its_file_name_and_format()
    {
        var client = await SignedUp();
        var run = await Uploaded(client, FitFiles.Run(Now.AddHours(-2).UtcDateTime, 6000, 330), @"C:\watch\Morning Run.fit");

        var source = run.GetProperty("source");
        source.GetProperty("kind").GetString().ShouldBe("Upload");
        source.GetProperty("format").GetString().ShouldBe("Fit");
        source.GetProperty("fileName").GetString().ShouldBe("Morning Run.fit");
        source.GetProperty("addedAt").ValueKind.ShouldBe(JsonValueKind.String);
    }

    [Fact]
    public async Task The_same_run_uploaded_with_a_start_a_few_seconds_apart_is_refused_as_a_duplicate()
    {
        var client = await SignedUp();
        var start = Now.AddHours(-3).UtcDateTime;
        await Uploaded(client, FitFiles.Run(start, 10_000, 300));

        var again = await Upload(client, FitFiles.Run(start.AddSeconds(45), 10_050, 300), "export.fit");

        again.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        JsonDocument.Parse(await again.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString().ShouldBe("activity_exists");
        (await Runs(client)).GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task A_different_run_starting_close_by_is_not_a_duplicate()
    {
        var client = await SignedUp();
        var start = Now.AddHours(-3).UtcDateTime;
        await Uploaded(client, FitFiles.Run(start, 10_000, 300));

        // A minute later but a third of the distance: a friend's watch, a separate warm-up. Kept, and flagged for the runner.
        await Uploaded(client, FitFiles.Run(start.AddMinutes(1), 3_000, 300), "warm-up.fit");

        (await Runs(client)).GetArrayLength().ShouldBe(2);
        var pairs = (await RunData(client)).GetProperty("possibleDuplicates");
        pairs.GetArrayLength().ShouldBe(1);
        pairs[0].GetProperty("relation").GetString().ShouldBe("Overlapping");
    }

    [Fact]
    public async Task Overlapping_runs_are_flagged_until_the_runner_keeps_both()
    {
        var client = await SignedUp();
        var start = Now.AddHours(-4).UtcDateTime;
        var first = (await Uploaded(client, FitFiles.Run(start, 10_000, 360))).GetProperty("id").GetGuid();
        var second = (await Uploaded(client, FitFiles.Run(start.AddMinutes(20), 4_000, 300), "second watch.fit")).GetProperty("id").GetGuid();
        (await RunData(client)).GetProperty("possibleDuplicates").GetArrayLength().ShouldBe(1);

        (await client.PostAsJsonAsync(Url("/api/v1/me/run-data/keep-both"), new { firstActivityId = second, secondActivityId = first }))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await RunData(client)).GetProperty("possibleDuplicates").GetArrayLength().ShouldBe(0);
        var stranger = await SignedUp();
        (await stranger.PostAsJsonAsync(Url("/api/v1/me/run-data/keep-both"), new { firstActivityId = first, secondActivityId = second }))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Uploading_a_synced_run_with_a_slightly_different_start_replaces_the_copy_and_keeps_its_check_in()
    {
        var (client, athlete) = await Connected();
        // A plan that starts today, so today's run is inside it whatever this class's shared clock says.
        var today = DateOnly.FromDateTime(Now.UtcDateTime);
        var tenK = new
        {
            raceName = "Autumn 10K",
            distanceKm = 10,
            raceDate = today.AddDays(70).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            goalTime = "00:52:00",
            runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
            longRunDay = "Sunday",
            currentWeeklyKm = 25,
            planFrom = today.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
        };
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = tenK }));
        var plan = saved.GetProperty("id").GetGuid();
        // Plans start on their first full week: move this class's clock to the first session's morning (08:00 in Johannesburg).
        var full = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}")));
        var firstDay = DateOnly.Parse(full.GetProperty("plan").GetProperty("weeks")[0].GetProperty("sessions")[0].GetProperty("date").GetString()!, System.Globalization.CultureInfo.InvariantCulture);
        var morning = new DateTimeOffset(firstDay.ToDateTime(new TimeOnly(6, 0)), TimeSpan.Zero);
        if (morning > Now)
        {
            factory.Time.Advance(morning - Now);
        }

        var start = Now.AddHours(-1);
        var stravaId = factory.Strava.AddRun(athlete, start, metres: 8_000, secondsPerKm: 360);
        await Push(athlete, stravaId);
        await factory.SyncAsync();
        var synced = (await Runs(client)).EnumerateArray().Single();
        var date = synced.GetProperty("localDate").GetString();
        var checkIn = Guid.NewGuid();
        (await client.PutAsJsonAsync(
                Url($"/api/v1/me/plans/{plan}/check-ins/additional/{checkIn}/{date}/Easy"),
                new { status = "Done", activityId = synced.GetProperty("id").GetGuid(), distanceUnreported = true }))
            .EnsureSuccessStatusCode();

        // The watch's file says the run started 20 s before Strava did.
        var upload = await Uploaded(client, FitFiles.Run(start.UtcDateTime.AddSeconds(-20), 8_000, 360));

        var runs = await Runs(client);
        runs.GetArrayLength().ShouldBe(1);
        runs[0].GetProperty("source").GetProperty("kind").GetString().ShouldBe("Upload");
        var checkIns = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")));
        checkIns.EnumerateArray().Single(c => c.GetProperty("id").GetGuid() == checkIn).GetProperty("activityId").GetGuid()
            .ShouldBe(upload.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task A_synced_run_of_an_uploaded_file_is_skipped_and_the_runner_is_told_why()
    {
        var (client, athlete) = await Connected();
        var start = Now.AddHours(-2);
        await Uploaded(client, FitFiles.Run(start.UtcDateTime, 8_000, 360));
        var stravaId = factory.Strava.AddRun(athlete, start.AddSeconds(30), metres: 8_000, secondsPerKm: 360);

        await Push(athlete, stravaId);
        await factory.SyncAsync();

        var runs = await Runs(client);
        runs.GetArrayLength().ShouldBe(1);
        runs[0].GetProperty("source").GetProperty("kind").GetString().ShouldBe("Upload");
        var issue = (await RunData(client)).GetProperty("syncIssues").EnumerateArray().Single();
        issue.GetProperty("stravaActivityId").GetInt64().ShouldBe(stravaId);
        issue.GetProperty("skipped").GetBoolean().ShouldBeTrue();
        issue.GetProperty("reason").GetString().ShouldBe(SkipReasons.AlreadyUploaded);
        // Skipped isn't failed: the Strava status doesn't count it as a run that couldn't be fetched.
        (await Json(await client.GetAsync(Url("/api/v1/me/sync/strava")))).GetProperty("failed").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task A_run_that_failed_after_every_retry_can_be_retried_by_the_runner()
    {
        var (client, athlete) = await Connected();
        var stravaId = factory.Strava.AddRun(athlete, Now.AddHours(-1));
        await Push(athlete, stravaId);
        for (var attempt = 0; attempt < 6; attempt++)
        {
            factory.Strava.FailNextRead = new StravaUnavailableException("Strava answered 503");
            await factory.SyncAsync();
            factory.Time.Advance(TimeSpan.FromHours(13));
        }

        var issue = (await RunData(client)).GetProperty("syncIssues").EnumerateArray().Single();
        issue.GetProperty("skipped").GetBoolean().ShouldBeFalse();
        issue.GetProperty("reason").GetString().ShouldBe("Strava answered 503");

        var retried = await Json(await client.PostAsync(Url("/api/v1/me/run-data/retry-strava"), null));
        retried.GetProperty("retried").GetInt32().ShouldBe(1);
        await factory.SyncAsync();

        (await Runs(client)).GetArrayLength().ShouldBe(1);
        (await RunData(client)).GetProperty("syncIssues").GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task Retrying_needs_a_working_strava_connection()
    {
        var client = await SignedUp();
        (await client.PostAsync(Url("/api/v1/me/run-data/retry-strava"), null)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task The_breakdown_shows_where_this_weeks_total_comes_from()
    {
        var (client, athlete) = await Connected();
        await Uploaded(client, FitFiles.Run(Now.AddHours(-3).UtcDateTime, 6_000, 330), "tuesday.fit");
        var stravaId = factory.Strava.AddRun(athlete, Now.AddHours(-1), metres: 4_000, secondsPerKm: 360);
        await Push(athlete, stravaId);
        await factory.SyncAsync();

        var data = await RunData(client);
        var week = data.GetProperty("totals").EnumerateArray().Single(t => t.GetProperty("period").GetString() == "week");
        week.GetProperty("runs").GetInt32().ShouldBe(2);
        week.GetProperty("uploadedRuns").GetInt32().ShouldBe(1);
        week.GetProperty("stravaRuns").GetInt32().ShouldBe(1);
        week.GetProperty("totalKm").GetDouble().ShouldBe(week.GetProperty("uploadedKm").GetDouble() + week.GetProperty("stravaKm").GetDouble(), 0.01);
        var sources = data.GetProperty("sources");
        sources.GetProperty("uploads").GetInt32().ShouldBe(1);
        sources.GetProperty("fit").GetInt32().ShouldBe(1);
        sources.GetProperty("strava").GetInt32().ShouldBe(1);
        sources.GetProperty("stravaConnected").GetBoolean().ShouldBeTrue();
        data.GetProperty("missing").GetProperty("runs").GetInt32().ShouldBe(2);
    }

    [Fact]
    public async Task Runs_export_as_csv_with_their_provenance_and_formulas_are_neutralised()
    {
        var client = await SignedUp();
        await Uploaded(client, FitFiles.Run(Now.AddDays(-2).UtcDateTime, 5_000, 300), "=HYPERLINK(evil).fit");
        await Uploaded(client, FitFiles.Run(Now.AddDays(-1).UtcDateTime, 7_000, 330), "long, slow.fit");

        var response = await client.GetAsync(Url("/api/v1/me/run-data/export.csv"));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.ShouldBe("text/csv");
        var lines = (await response.Content.ReadAsStringAsync()).TrimStart('\uFEFF').Split('\n', StringSplitOptions.RemoveEmptyEntries);
        lines.Length.ShouldBe(3);
        lines[0].ShouldStartWith("date,started_at_utc,source,file_format,file_name");
        lines[1].ShouldContain("Upload,Fit,'=HYPERLINK(evil).fit");
        lines[2].ShouldContain("\"long, slow.fit\"");
    }

    [Fact]
    public async Task Several_runs_are_deleted_at_once_and_someone_elses_ids_are_ignored()
    {
        var client = await SignedUp();
        var one = (await Uploaded(client, FitFiles.Run(Now.AddDays(-3).UtcDateTime, 5_000, 300))).GetProperty("id").GetGuid();
        var two = (await Uploaded(client, FitFiles.Run(Now.AddDays(-2).UtcDateTime, 5_000, 300))).GetProperty("id").GetGuid();
        var keep = (await Uploaded(client, FitFiles.Run(Now.AddDays(-1).UtcDateTime, 5_000, 300))).GetProperty("id").GetGuid();
        var stranger = await SignedUp();
        var theirs = (await Uploaded(stranger, FitFiles.Run(Now.AddDays(-1).UtcDateTime, 5_000, 300))).GetProperty("id").GetGuid();

        var deleted = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/run-data/delete"), new { activityIds = new[] { one, two, theirs } }));

        deleted.GetProperty("deleted").GetInt32().ShouldBe(2);
        (await Runs(client)).EnumerateArray().Select(r => r.GetProperty("id").GetGuid()).ShouldBe([keep]);
        (await Runs(stranger)).GetArrayLength().ShouldBe(1);
        (await client.PostAsJsonAsync(Url("/api/v1/me/run-data/delete"), new { activityIds = Array.Empty<Guid>() }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }
}
