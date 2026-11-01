using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>Shoes: distances from the runs worn in each pair, the default pair, limits, reminders, and runs from Strava.</summary>
[Collection(StravaInSeries.Name)]
public sealed class ShoeTests(StravaApiFactory factory) : IClassFixture<StravaApiFactory>
{
    private static readonly object Profile = new
    {
        displayName = "Thandi",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    private static long nextAthlete = 110_000;

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

    private static async Task<Guid> Upload(HttpClient client, byte[] file)
    {
        var content = new MultipartFormDataContent();
        var bytes = new ByteArrayContent(file);
        bytes.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(bytes, "file", "run.fit");
        return (await Json(await client.PostAsync(Url("/api/v1/me/activities"), content))).GetProperty("id").GetGuid();
    }

    private static async Task<Guid> NewPair(HttpClient client, string name, double startingKm = 0, double limitKm = 700, bool isDefault = false, bool remind = true) =>
        (await Json(await client.PostAsJsonAsync(Url("/api/v1/me/shoes"), new { name, startingKm, limitKm, isDefault, remindAtLimit = remind }))).GetProperty("id").GetGuid();

    private static async Task<JsonElement> Pair(HttpClient client, Guid id) =>
        (await Json(await client.GetAsync(Url("/api/v1/me/shoes")))).EnumerateArray().Single(s => s.GetProperty("id").GetGuid() == id);

    private static Task<HttpResponseMessage> Wear(HttpClient client, Guid? shoeId, Guid? activityId = null, Guid? checkInId = null) =>
        client.PutAsJsonAsync(Url("/api/v1/me/shoes/worn"), new { shoeId, activityId, checkInId });

    [Fact]
    public void Test_class_runs_in_the_strava_series_so_its_syncs_never_take_another_classes_jobs() =>
        typeof(ShoeTests).GetCustomAttributes(typeof(CollectionAttribute), false).ShouldNotBeEmpty();

    [Fact]
    public async Task A_pairs_distance_is_what_it_had_run_plus_the_runs_worn_in_it()
    {
        var client = await SignedUp();
        var pair = await NewPair(client, "Pegasus 41", startingKm: 120);
        var run = await Upload(client, FitFiles.Run(Now.AddDays(-2).UtcDateTime, 10_000, 330));

        (await Wear(client, pair, run)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var shoe = await Pair(client, pair);
        shoe.GetProperty("totalKm").GetDouble().ShouldBe(130, 0.1);
        shoe.GetProperty("runs").GetInt32().ShouldBe(1);
        shoe.GetProperty("wear").GetString().ShouldBe("Fine");
        var listed = (await Json(await client.GetAsync(Url("/api/v1/me/activities")))).EnumerateArray().Single();
        listed.GetProperty("shoe").GetProperty("name").GetString().ShouldBe("Pegasus 41");

        // Taking the run off the pair, or deleting the run, takes its kilometres off too: nothing was copied.
        (await Wear(client, null, run)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Pair(client, pair)).GetProperty("totalKm").GetDouble().ShouldBe(120, 0.1);
        (await Wear(client, pair, run)).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Url($"/api/v1/me/activities/{run}"))).EnsureSuccessStatusCode();
        (await Pair(client, pair)).GetProperty("runs").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task New_uploads_go_on_the_default_pair_and_only_one_pair_is_the_default()
    {
        var client = await SignedUp();
        var first = await NewPair(client, "Daily trainers", isDefault: true);
        var second = await NewPair(client, "Racing flats", isDefault: true);

        await Upload(client, FitFiles.Run(Now.AddDays(-1).UtcDateTime, 8_000, 340));

        (await Pair(client, first)).GetProperty("isDefault").GetBoolean().ShouldBeFalse();
        var flats = await Pair(client, second);
        flats.GetProperty("isDefault").GetBoolean().ShouldBeTrue();
        flats.GetProperty("runs").GetInt32().ShouldBe(1);
    }

    [Fact]
    public async Task Uploading_the_file_of_a_synced_run_keeps_the_pair_it_was_worn_in()
    {
        var client = await SignedUp();
        var athlete = Interlocked.Increment(ref nextAthlete);
        var authorize = await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(athlete), state, scope = "read,activity:read_all" }));
        var trail = await NewPair(client, "Trail shoes");
        var road = await NewPair(client, "Road shoes", isDefault: true);
        var start = Now.AddHours(-3);
        factory.Strava.AddRun(athlete, start, metres: 12_000, secondsPerKm: 360);
        await factory.SyncAsync();

        var synced = (await Json(await client.GetAsync(Url("/api/v1/me/activities")))).EnumerateArray().Single();
        synced.GetProperty("shoe").GetProperty("id").GetGuid().ShouldBe(road);
        (await Wear(client, trail, synced.GetProperty("id").GetGuid())).EnsureSuccessStatusCode();
        (await Pair(client, trail)).GetProperty("stravaKm").GetDouble().ShouldBe(12, 0.1);

        await Upload(client, FitFiles.Run(start.UtcDateTime.AddSeconds(15), 12_000, 360));

        var trailNow = await Pair(client, trail);
        trailNow.GetProperty("runs").GetInt32().ShouldBe(1);
        trailNow.GetProperty("stravaKm").GetDouble().ShouldBe(0);
        (await Pair(client, road)).GetProperty("runs").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task Reaching_the_limit_reminds_once_and_a_retired_pair_takes_no_new_runs()
    {
        var client = await SignedUp();
        var pair = await NewPair(client, "Old faithfuls", startingKm: 495, limitKm: 500);
        var run = await Upload(client, FitFiles.Run(Now.AddDays(-1).UtcDateTime, 6_000, 330));

        (await Wear(client, pair, run)).EnsureSuccessStatusCode();

        (await Pair(client, pair)).GetProperty("wear").GetString().ShouldBe("PastLimit");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            (await db.Shoes.SingleAsync(s => s.Id == pair)).RemindedAtLimitKm.ShouldBe(500);
        }

        var retire = new { name = "Old faithfuls", startingKm = 495, limitKm = 500, isDefault = false, remindAtLimit = true, retired = true };
        (await client.PutAsJsonAsync(Url($"/api/v1/me/shoes/{pair}"), retire)).EnsureSuccessStatusCode();
        var another = await Upload(client, FitFiles.Run(Now.AddHours(-5).UtcDateTime, 5_000, 330));
        (await Wear(client, pair, another)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Past_runs_can_be_put_on_a_pair_at_once_and_runs_on_another_pair_stay_put()
    {
        var client = await SignedUp();
        var older = await NewPair(client, "Older pair");
        var newer = await NewPair(client, "New pair");
        var one = await Upload(client, FitFiles.Run(Now.AddDays(-10).UtcDateTime, 5_000, 330));
        var two = await Upload(client, FitFiles.Run(Now.AddDays(-9).UtcDateTime, 6_000, 330));
        (await Wear(client, older, one)).EnsureSuccessStatusCode();

        var unworn = await Json(await client.GetAsync(Url("/api/v1/me/shoes/unworn-runs")));
        unworn.EnumerateArray().Select(r => r.GetProperty("activityId").GetGuid()).ShouldBe([two]);

        var added = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/shoes/{newer}/runs"), new { activityIds = new[] { one, two } }));
        added.GetProperty("added").GetInt32().ShouldBe(1);
        (await Pair(client, older)).GetProperty("runs").GetInt32().ShouldBe(1);
        (await Pair(client, newer)).GetProperty("runs").GetInt32().ShouldBe(1);
    }

    [Fact]
    public async Task A_check_in_with_a_distance_counts_and_a_linked_check_in_never_counts_twice()
    {
        var client = await SignedUp();
        var today = DateOnly.FromDateTime(Now.UtcDateTime);
        var plan = new
        {
            raceName = "Shoe 10K",
            distanceKm = 10,
            raceDate = today.AddDays(70).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            goalTime = "00:52:00",
            runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
            longRunDay = "Sunday",
            currentWeeklyKm = 25,
            planFrom = today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        };
        var saved = (await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan }))).GetProperty("id").GetGuid();
        var full = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{saved}")));
        var day = full.GetProperty("plan").GetProperty("weeks")[0].GetProperty("sessions")[0].GetProperty("date").GetString()!;
        var morning = new DateTimeOffset(DateOnly.Parse(day, CultureInfo.InvariantCulture).ToDateTime(new TimeOnly(6, 0)), TimeSpan.Zero);
        if (morning > Now)
        {
            factory.Time.Advance(morning - Now);
        }

        var pair = await NewPair(client, "Check-in pair");
        var manual = Guid.NewGuid();
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{saved}/check-ins/additional/{manual}/{day}/Easy"), new { status = "Done", distanceKm = 7.5 }))
            .EnsureSuccessStatusCode();
        (await Wear(client, pair, checkInId: manual)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Pair(client, pair)).GetProperty("totalKm").GetDouble().ShouldBe(7.5, 0.1);

        // A check-in linked to an uploaded run is that run: wearing either puts the run on the pair, once.
        var run = await Upload(client, FitFiles.Run(Now.AddHours(-1).UtcDateTime, 6_000, 330));
        var linked = Guid.NewGuid();
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{saved}/check-ins/additional/{linked}/{day}/Easy"), new { status = "Done", activityId = run, distanceUnreported = true }))
            .EnsureSuccessStatusCode();
        (await Wear(client, pair, checkInId: linked)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Wear(client, pair, run)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var shoe = await Pair(client, pair);
        shoe.GetProperty("runs").GetInt32().ShouldBe(2);
        shoe.GetProperty("totalKm").GetDouble().ShouldBe(13.5, 0.1);
    }

    [Fact]
    public async Task Another_runners_pair_and_runs_are_out_of_reach_and_shoes_are_in_the_export()
    {
        var client = await SignedUp();
        var pair = await NewPair(client, "Mine");
        var run = await Upload(client, FitFiles.Run(Now.AddDays(-3).UtcDateTime, 5_000, 330));
        (await Wear(client, pair, run)).EnsureSuccessStatusCode();
        var stranger = await SignedUp();

        (await Wear(stranger, pair, run)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await stranger.DeleteAsync(Url($"/api/v1/me/shoes/{pair}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Json(await stranger.GetAsync(Url("/api/v1/me/shoes")))).GetArrayLength().ShouldBe(0);

        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        var exported = export.GetProperty("shoes").EnumerateArray().Single();
        exported.GetProperty("shoe").GetProperty("name").GetString().ShouldBe("Mine");
        exported.GetProperty("activityIds").EnumerateArray().Single().GetGuid().ShouldBe(run);

        (await client.DeleteAsync(Url($"/api/v1/me/shoes/{pair}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Json(await client.GetAsync(Url("/api/v1/me/activities")))).GetArrayLength().ShouldBe(1);
    }
}
