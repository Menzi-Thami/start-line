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
        run.GetProperty("maxHeartRate").GetInt32().ShouldBe(160);
        run.GetProperty("calories").GetInt32().ShouldBe(700);
        run.GetProperty("splits").GetArrayLength().ShouldBe(10);
        run.GetProperty("halves").GetProperty("verdict").GetString().ShouldBe("Even");

        var efforts = run.GetProperty("bestEfforts").EnumerateArray().ToList();
        efforts.Select(e => e.GetProperty("name").GetString()).ShouldBe(["400 m", "½ mile", "1K", "1 mile", "2 mile", "5K", "10K"]);
        efforts.ShouldAllBe(e => e.GetProperty("isPersonalBest").GetBoolean());
        run.GetProperty("plan").ValueKind.ShouldBe(JsonValueKind.Null);
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
        compared.GetProperty("pace").GetString().ShouldBeOneOf("Faster", "OnTarget", "Slower");

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
    public async Task A_file_that_isnt_fit_is_rejected_with_a_hint()
    {
        var response = await Upload(await SignedUp(), "<gpx>not a fit file</gpx>"u8.ToArray(), "run.gpx");

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var problem = await Json(response);
        Code(problem).ShouldBe("validation_failed");
        problem.GetProperty("errors").GetProperty("file")[0].GetString()!.ShouldContain("Export Original");
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
    public async Task A_slower_run_is_not_a_personal_best_but_the_faster_one_stays_one()
    {
        var client = await SignedUp();
        var fast = await Uploaded(client, FitFiles.Run(Morning, 5000, 280));
        var slow = await Uploaded(client, FitFiles.Run(Morning.AddDays(1), 5000, 320));

        static bool FiveKIsBest(JsonElement run) =>
            run.GetProperty("bestEfforts").EnumerateArray().Single(e => e.GetProperty("name").GetString() == "5K").GetProperty("isPersonalBest").GetBoolean();

        FiveKIsBest(slow).ShouldBeFalse();
        FiveKIsBest(await Json(await client.GetAsync(Url($"/api/v1/me/activities/{fast.GetProperty("id").GetGuid()}")))).ShouldBeTrue();
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
