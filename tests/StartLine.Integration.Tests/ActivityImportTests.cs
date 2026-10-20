using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Dynastream.Fit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;
using DateTime = System.DateTime;

namespace StartLine.Integration.Tests;

public sealed class ActivityImportTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    // 05:00 in Johannesburg on the day after the pinned clock's "today".
    private static readonly DateTime Morning = new(2026, 10, 9, 3, 0, 0, DateTimeKind.Utc);

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

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<HttpClient> SignedUp()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        return client;
    }

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

    private static string Code(JsonElement problem) => problem.GetProperty("code").GetString()!;

    [Fact]
    public async Task A_run_shows_its_totals_splits_halves_and_best_efforts()
    {
        var client = await SignedUp();

        var run = await Uploaded(client, FitFiles.Run(Morning, 10_000, 300));

        run.GetProperty("localDate").GetString().ShouldBe("2026-10-09");
        run.GetProperty("kind").GetString().ShouldBe("Run");
        run.GetProperty("distanceKm").GetDouble().ShouldBe(10, tolerance: 0.01);
        run.GetProperty("movingSeconds").GetDouble().ShouldBe(3000, tolerance: 1);
        run.GetProperty("paceSecondsPerKm").GetDouble().ShouldBe(300, tolerance: 0.5);
        run.GetProperty("elevationGainMetres").GetDouble().ShouldBe(20);
        run.GetProperty("averageHeartRate").GetInt32().ShouldBe(150);
        run.GetProperty("maxHeartRate").GetInt32().ShouldBe(150);
        run.GetProperty("calories").GetInt32().ShouldBe(700);
        run.GetProperty("splits").GetArrayLength().ShouldBe(10);
        run.GetProperty("halves").GetProperty("verdict").GetString().ShouldBe("Even");

        var efforts = run.GetProperty("bestEfforts").EnumerateArray().ToList();
        efforts.Select(e => e.GetProperty("name").GetString()).ShouldBe(["400 m", "½ mile", "1K", "1 mile", "2 mile", "5K", "10K"]);
        // A first run has nothing to beat yet, so nothing is put up front.
        efforts.ShouldAllBe(e => e.GetProperty("standing").GetString() == "FirstTime" && !e.GetProperty("isWorthShowing").GetBoolean());
        run.GetProperty("plan").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task A_run_that_fades_marks_its_hardest_kilometre_and_its_slower_second_half()
    {
        Stretch[] fade = [new(4000, 300, HeartRate: 150), new(1000, 290, HeartRate: 158), new(4000, 320, HeartRate: 162), new(1000, 345, 25, 170)];

        var run = await Uploaded(await SignedUp(), FitFiles.Run(Morning, fade));

        var splits = run.GetProperty("splits").EnumerateArray().ToList();
        splits.Single(s => s.GetProperty("isQuickest").GetBoolean()).GetProperty("number").GetInt32().ShouldBe(5);
        splits.Single(s => s.GetProperty("isHardest").GetBoolean()).GetProperty("number").GetInt32().ShouldBe(10);
        splits[9].GetProperty("averageHeartRate").GetInt32().ShouldBe(170);
        var halves = run.GetProperty("halves");
        halves.GetProperty("verdict").GetString().ShouldBe("PositiveSplit");
        halves.GetProperty("secondHalfSlowerBySecondsPerKm").GetDouble().ShouldBe(27, tolerance: 0.5);
        run.GetProperty("maxHeartRate").GetInt32().ShouldBe(170);
    }

    [Fact]
    public async Task A_run_on_a_planned_day_is_compared_with_that_session()
    {
        var client = await SignedUp();
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ComradesPlan });
        var planId = (await Json(saved)).GetProperty("id").GetGuid();
        var plan = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{planId}")));
        var session = plan.GetProperty("plan").GetProperty("weeks").EnumerateArray()
            .SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .First(s => s.GetProperty("type").GetString() != "Strength");
        var day = DateOnly.Parse(session.GetProperty("date").GetString()!, CultureInfo.InvariantCulture);

        var run = await Uploaded(client, FitFiles.Run(day.ToDateTime(new TimeOnly(3, 0), DateTimeKind.Utc), 8000, 360));

        var compared = run.GetProperty("plan");
        compared.GetProperty("title").GetString().ShouldBe(session.GetProperty("title").GetString());
        compared.GetProperty("planName").GetString().ShouldBe("Comrades Marathon");
        compared.GetProperty("plannedKm").GetDouble().ShouldBe(session.GetProperty("distanceKm").GetDouble());
        compared.GetProperty("actualKm").GetDouble().ShouldBe(8, tolerance: 0.01);
        compared.GetProperty("pace").GetString().ShouldBeOneOf("Faster", "OnTarget", "Slower", "NoTarget");

        var listed = await Json(await client.GetAsync(Url("/api/v1/me/activities")));
        listed[0].GetProperty("plannedTitle").GetString().ShouldBe(session.GetProperty("title").GetString());
    }

    [Fact]
    public async Task The_zip_from_garmin_connects_export_original_is_accepted()
    {
        var client = await SignedUp();

        var run = await Uploaded(client, FitFiles.Zipped(FitFiles.Run(Morning, 5000, 330)), "21456789012.zip");

        run.GetProperty("distanceKm").GetDouble().ShouldBe(5, tolerance: 0.01);
    }

    [Fact]
    public async Task A_treadmill_run_is_marked_as_one()
    {
        var run = await Uploaded(await SignedUp(), FitFiles.Run(Morning, 5000, 330, subSport: SubSport.Treadmill));

        run.GetProperty("kind").GetString().ShouldBe("TreadmillRun");
    }

    [Fact]
    public async Task Uploading_the_same_run_twice_is_a_conflict()
    {
        var client = await SignedUp();
        var file = FitFiles.Run(Morning, 5000, 300);
        await Uploaded(client, file);

        var again = await Upload(client, file);

        again.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        Code(await Json(again)).ShouldBe("activity_exists");
    }

    [Fact]
    public async Task A_file_that_isnt_an_activity_is_rejected_with_a_hint()
    {
        // Not FIT and not XML: it goes to the FIT reader, which points the runner at Export Original.
        var binary = await Upload(await SignedUp(), "this is not an activity file"u8.ToArray(), "run.dat");

        binary.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        Code(await Json(binary)).ShouldBe("validation_failed");
        (await Json(binary)).GetProperty("errors").GetProperty("file")[0].GetString()!.ShouldContain("Export Original");

        // A .gpx that has no track points gets a GPX-appropriate hint instead.
        var emptyGpx = await Upload(await SignedUp(), "<gpx><trk><trkseg></trkseg></trk></gpx>"u8.ToArray(), "run.gpx");

        emptyGpx.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(emptyGpx)).GetProperty("errors").GetProperty("file")[0].GetString()!.ShouldContain("track points");
    }

    [Fact]
    public async Task An_upload_without_a_file_is_rejected()
    {
        var response = await (await SignedUp()).PostAsync(Url("/api/v1/me/activities"), new MultipartFormDataContent { { new StringContent("x"), "note" } });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("errors").TryGetProperty("file", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task A_ride_is_not_a_run()
    {
        var response = await Upload(await SignedUp(), FitFiles.Run(Morning, 30_000, 120, Sport.Cycling, SubSport.Road));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        Code(await Json(response)).ShouldBe("invalid_request");
    }

    [Fact]
    public async Task A_file_over_the_size_limit_is_rejected()
    {
        var response = await Upload(await SignedUp(), new byte[(10 * 1024 * 1024) + 1]);

        response.StatusCode.ShouldBeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.RequestEntityTooLarge);
    }

    [Fact]
    public async Task Only_signed_up_runners_can_upload()
    {
        var anonymous = await Upload(factory.CreateClient(), FitFiles.Run(Morning, 5000, 300));
        var notSignedUp = await Upload(factory.CreateClient().As(Guid.NewGuid().ToString()), FitFiles.Run(Morning, 5000, 300));

        anonymous.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        notSignedUp.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        Code(await Json(notSignedUp)).ShouldBe("registration_required");
    }

    [Fact]
    public async Task Each_run_is_measured_against_the_runners_other_runs()
    {
        var client = await SignedUp();
        var fast = await Uploaded(client, FitFiles.Run(Morning, 5000, 280));
        var slow = await Uploaded(client, FitFiles.Run(Morning.AddDays(1), 5000, 320));
        var close = await Uploaded(client, FitFiles.Run(Morning.AddDays(2), 5000, 285));

        static JsonElement FiveK(JsonElement run) =>
            run.GetProperty("bestEfforts").EnumerateArray().Single(e => e.GetProperty("name").GetString() == "5K");

        FiveK(slow).GetProperty("standing").GetString().ShouldBe("Slower");
        FiveK(slow).GetProperty("previousBestSeconds").GetDouble().ShouldBe(1400, tolerance: 1);
        FiveK(close).GetProperty("standing").GetString().ShouldBe("NearBest");
        FiveK(close).GetProperty("isWorthShowing").GetBoolean().ShouldBeTrue();
        var fastNow = await Json(await client.GetAsync(Url($"/api/v1/me/activities/{fast.GetProperty("id").GetGuid()}")));
        FiveK(fastNow).GetProperty("standing").GetString().ShouldBe("PersonalBest");
    }

    [Fact]
    public async Task A_tempo_is_judged_on_its_work_block_with_the_warm_up_and_cool_down_marked()
    {
        var client = await SignedUp();
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ComradesPlan });
        var planId = (await Json(saved)).GetProperty("id").GetGuid();
        var plan = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{planId}")));
        var tempoZone = plan.GetProperty("plan").GetProperty("paces").EnumerateArray().Single(p => p.GetProperty("zone").GetString() == "Tempo");
        var tempo = plan.GetProperty("plan").GetProperty("weeks").EnumerateArray()
            .SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .First(s => s.GetProperty("type").GetString() == "Tempo");
        var day = DateOnly.Parse(tempo.GetProperty("date").GetString()!, CultureInfo.InvariantCulture);
        var tempoPace = (tempoZone.GetProperty("fastestSecondsPerKm").GetDouble() + tempoZone.GetProperty("slowestSecondsPerKm").GetDouble()) / 2;
        var workKm = Math.Ceiling(tempo.GetProperty("distanceKm").GetDouble() - 3.5);

        var run = await Uploaded(client, FitFiles.Run(day.ToDateTime(new TimeOnly(4, 0), DateTimeKind.Utc),
            [new Stretch(2000, 420), new Stretch(workKm * 1000, tempoPace), new Stretch(1500, 430)]));

        var compared = run.GetProperty("plan");
        compared.GetProperty("shape").GetString().ShouldBe("Continuous");
        compared.GetProperty("judged").GetString().ShouldBe("WorkBlock");
        compared.GetProperty("pace").GetString().ShouldBe("OnTarget");
        var roles = run.GetProperty("splits").EnumerateArray().Select(s => s.GetProperty("role").GetString()).ToList();
        roles[0].ShouldBe("WarmUp");
        roles.ShouldContain("Work");
        roles[^1].ShouldBe("CoolDown");
        run.GetProperty("splits").EnumerateArray().Where(s => s.GetProperty("role").GetString() == "Work")
            .ShouldAllBe(s => s.GetProperty("zone").GetString() == "Tempo");
        compared.GetProperty("nextTitle").GetString().ShouldNotBeNullOrEmpty();
    }

    [Fact]
    public async Task Heart_rate_zones_appear_once_the_runner_sets_a_max_heart_rate()
    {
        var client = await SignedUp();
        var id = (await Uploaded(client, FitFiles.Run(Morning, 5000, 300))).GetProperty("id").GetGuid();
        (await Json(await client.GetAsync(Url($"/api/v1/me/activities/{id}")))).GetProperty("heartRate").GetProperty("zones").ValueKind
            .ShouldBe(JsonValueKind.Null);

        var tooHigh = await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Thandi", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true, maxHeartRate = 260 });
        tooHigh.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Thandi", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true, maxHeartRate = 190 })).EnsureSuccessStatusCode();

        var zones = (await Json(await client.GetAsync(Url($"/api/v1/me/activities/{id}")))).GetProperty("heartRate").GetProperty("zones");
        zones.GetArrayLength().ShouldBe(5);
        zones[2].GetProperty("seconds").GetDouble().ShouldBe(1500, tolerance: 2); // 150 bpm is 79% of 190: zone 3
    }

    [Fact]
    public async Task Runs_are_private_to_their_runner_and_can_be_deleted()
    {
        var client = await SignedUp();
        var someoneElse = await SignedUp();
        var id = (await Uploaded(client, FitFiles.Run(Morning, 5000, 300))).GetProperty("id").GetGuid();

        (await someoneElse.GetAsync(Url($"/api/v1/me/activities/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await someoneElse.DeleteAsync(Url($"/api/v1/me/activities/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Json(await someoneElse.GetAsync(Url("/api/v1/me/activities")))).GetArrayLength().ShouldBe(0);

        (await client.DeleteAsync(Url($"/api/v1/me/activities/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.GetAsync(Url($"/api/v1/me/activities/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task The_export_includes_runs_and_deleting_the_account_removes_them()
    {
        var client = await SignedUp();
        var id = (await Uploaded(client, FitFiles.Run(Morning, 5000, 300))).GetProperty("id").GetGuid();

        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        export.GetProperty("activities").GetArrayLength().ShouldBe(1);
        export.GetProperty("activities")[0].GetProperty("splits").GetArrayLength().ShouldBe(5);

        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.Activities.AnyAsync(a => a.Id == id)).ShouldBeFalse();
        (await db.Database.SqlQuery<int>($"SELECT COUNT(*) AS Value FROM ActivitySplits WHERE ActivityId = {id}").SingleAsync()).ShouldBe(0);
        (await db.Database.SqlQuery<int>($"SELECT COUNT(*) AS Value FROM ActivityBestEfforts WHERE ActivityId = {id}").SingleAsync()).ShouldBe(0);
    }
}
