using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>
/// A held Strava run completes its planned session on read, through the API, the database and the sync worker: nothing is
/// stored, the runner's word wins, and the completion lapses with the cached copy or the connection.
/// </summary>
[Collection(StravaInSeries.Name)]
public sealed class StravaCompletionTests
{
    // Wednesday evening in Johannesburg: the week of 19 October is behind the runner.
    private static readonly DateTimeOffset Wednesday = new(2026, 10, 28, 16, 0, 0, TimeSpan.Zero);
    private static long nextAthlete = 80_000;

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        return JsonDocument.Parse(body).RootElement;
    }

    private sealed record Planned(StravaApiFactory Factory, HttpClient Client, long Athlete, Guid PlanId, IReadOnlyList<JsonElement> Sessions)
    {
        public JsonElement On(string date) => Sessions.Single(s => s.GetProperty("date").GetString() == date && s.GetProperty("type").GetString() != "Strength");

        public async Task<JsonElement> Completions() => await Json(await Client.GetAsync(Url($"/api/v1/me/plans/{PlanId}/strava-completions")));

        public async Task<JsonElement> CheckIns() => await Json(await Client.GetAsync(Url($"/api/v1/me/plans/{PlanId}/check-ins")));

        public async Task<int> AdherenceDone() =>
            (await Json(await Client.GetAsync(Url($"/api/v1/me/plans/{PlanId}/insights")))).GetProperty("trends").GetProperty("adherence").GetProperty("done").GetInt32();

        public Task<HttpResponseMessage> CheckIn(string date, string status) =>
            Client.PutAsJsonAsync(Url($"/api/v1/me/plans/{PlanId}/check-ins/{date}/{On(date).GetProperty("type").GetString()}"), new { status, effort = (int?)null });

        /// <summary>Strava has a run, and tells Taperday, which fetches it.</summary>
        public async Task<long> Synced(DateTimeOffset start, double metres, double secondsPerKm = 360)
        {
            var id = Factory.Strava.AddRun(Athlete, start, metres, secondsPerKm);
            (await Push("activity", id, "create")).StatusCode.ShouldBe(HttpStatusCode.OK);
            await Factory.SyncAsync();
            return id;
        }

        public Task<HttpResponseMessage> Push(string objectType, long objectId, string aspect, object? updates = null) =>
            Factory.CreateClient().PostAsJsonAsync(Url($"/api/v1/webhooks/strava/{StravaApiFactory.HookSecret}"), new Dictionary<string, object?>
            {
                ["object_type"] = objectType,
                ["object_id"] = objectId,
                ["aspect_type"] = aspect,
                ["owner_id"] = Athlete,
                ["subscription_id"] = StravaApiFactory.SubscriptionId,
                ["event_time"] = Factory.Time.GetUtcNow().ToUnixTimeSeconds(),
                ["updates"] = updates ?? new { },
            });
    }

    /// <summary>
    /// A runner in Johannesburg on a 10K plan from 19 October (runs Monday, Tuesday, Wednesday, Friday and Sunday, strength
    /// on Thursday, Saturday off), with Strava connected.
    /// </summary>
    private static async Task<Planned> Runner(StravaApiFactory factory)
    {
        factory.Time.SetUtcNow(Wednesday);
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        var athlete = Interlocked.Increment(ref nextAthlete);
        var authorize = await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(athlete), state, scope = "read,activity:read_all" }));
        await factory.SyncAsync();
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            plan = new
            {
                raceName = "Flexible 10K",
                distanceKm = 10,
                raceDate = "2026-12-20",
                goalTime = "00:52:00",
                runDays = new[] { "Monday", "Tuesday", "Wednesday", "Friday", "Sunday" },
                longRunDay = "Sunday",
                currentWeeklyKm = 40,
                planFrom = "2026-10-19",
                strengthDays = new[] { "Thursday" },
                version = 2,
            },
        }));
        var id = saved.GetProperty("id").GetGuid();
        var plan = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        return new(factory, client, athlete, id, [.. plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray())]);
    }

    /// <summary>08:00 in Johannesburg on that day.</summary>
    private static DateTimeOffset Morning(string date) => new(DateOnly.Parse(date, CultureInfo.InvariantCulture).ToDateTime(new TimeOnly(6, 0)), TimeSpan.Zero);

    private static double Metres(JsonElement session, double share = 1) => session.GetProperty("distanceKm").GetDouble() * 1000 * share;

    [Fact]
    public async Task A_synced_run_completes_its_session_on_read_without_storing_a_check_in_and_repeated_syncs_change_nothing()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);
        (await runner.AdherenceDone()).ShouldBe(0);

        var id = await runner.Synced(Morning("2026-10-19"), Metres(runner.On("2026-10-19"), 0.6));

        var completions = await runner.Completions();
        var completion = completions.EnumerateArray().ShouldHaveSingleItem();
        completion.GetProperty("date").GetString().ShouldBe("2026-10-19");
        completion.GetProperty("sessionType").GetString().ShouldBe(runner.On("2026-10-19").GetProperty("type").GetString());
        completion.GetProperty("state").GetString().ShouldBe("Completed");
        completion.GetProperty("measure").GetString().ShouldBe("Distance");
        completion.GetProperty("feedback").GetString().ShouldBe("Shorter");
        completion.GetProperty("actualKm").GetDouble().ShouldBe(Metres(runner.On("2026-10-19"), 0.6) / 1000, tolerance: 0.01);
        completion.GetProperty("cachedUntil").GetDateTimeOffset().ShouldBe(Wednesday.AddDays(7));
        (await runner.CheckIns()).GetArrayLength().ShouldBe(0);
        (await runner.AdherenceDone()).ShouldBe(1);

        // The webhook again, an edit, and a catch-up: still one completion, and still nothing written.
        await runner.Push("activity", id, "create");
        await runner.Push("activity", id, "update", new { title = "Morning run" });
        await factory.SyncAsync();
        (await runner.Completions()).GetRawText().ShouldBe(completions.GetRawText());
        (await runner.CheckIns()).GetArrayLength().ShouldBe(0);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.SessionCheckIns.CountAsync(c => c.SavedPlanId == runner.PlanId)).ShouldBe(0);
    }

    [Fact]
    public async Task The_runners_own_answer_wins_a_skip_is_shown_as_a_conflict_and_removing_it_brings_the_completion_back()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);
        await runner.Synced(Morning("2026-10-20"), Metres(runner.On("2026-10-20")));

        await Json(await runner.CheckIn("2026-10-20", "Skipped"));
        (await runner.Completions()).EnumerateArray().ShouldHaveSingleItem().GetProperty("state").GetString().ShouldBe("Conflict");
        (await runner.AdherenceDone()).ShouldBe(0);

        await Json(await runner.CheckIn("2026-10-20", "Done"));
        (await runner.Completions()).GetArrayLength().ShouldBe(0);
        (await runner.AdherenceDone()).ShouldBe(1);

        var type = runner.On("2026-10-20").GetProperty("type").GetString();
        (await runner.Client.DeleteAsync(Url($"/api/v1/me/plans/{runner.PlanId}/check-ins/2026-10-20/{type}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await runner.Completions()).EnumerateArray().ShouldHaveSingleItem().GetProperty("state").GetString().ShouldBe("Completed");
    }

    [Fact]
    public async Task When_the_cached_copy_lapses_a_session_falls_back_to_what_the_runner_ticked()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);
        await runner.Synced(Morning("2026-10-19"), Metres(runner.On("2026-10-19")));
        await runner.Synced(Morning("2026-10-20"), Metres(runner.On("2026-10-20")));
        // "Keep this tick" on Tuesday: a plain Done, the runner's own.
        await Json(await runner.CheckIn("2026-10-20", "Done"));
        (await runner.Completions()).EnumerateArray().ShouldHaveSingleItem().GetProperty("date").GetString().ShouldBe("2026-10-19");
        (await runner.AdherenceDone()).ShouldBe(2);

        // Strava access is lost without Taperday hearing, so a week of refreshes fails and the copies lapse.
        factory.Strava.Revoke(runner.Athlete);
        for (var day = 1; day <= 7; day++)
        {
            factory.Time.Advance(TimeSpan.FromDays(1));
            await factory.SyncAsync();
        }

        (await runner.Completions()).GetArrayLength().ShouldBe(0);
        var kept = (await runner.CheckIns()).EnumerateArray().ShouldHaveSingleItem();
        kept.GetProperty("date").GetString().ShouldBe("2026-10-20");
        kept.GetProperty("status").GetString().ShouldBe("Done");
        (await runner.AdherenceDone()).ShouldBe(1);
    }

    [Fact]
    public async Task Disconnecting_strava_removes_its_completions_at_once()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);
        await runner.Synced(Morning("2026-10-19"), Metres(runner.On("2026-10-19")));
        (await runner.Completions()).GetArrayLength().ShouldBe(1);

        await Json(await runner.Client.DeleteAsync(Url("/api/v1/me/sync/strava")));

        (await runner.Completions()).GetArrayLength().ShouldBe(0);
        (await runner.AdherenceDone()).ShouldBe(0);
    }

    [Fact]
    public async Task Revoking_access_on_strava_removes_its_completions()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);
        await runner.Synced(Morning("2026-10-19"), Metres(runner.On("2026-10-19")));

        factory.Strava.Revoke(runner.Athlete);
        await runner.Push("athlete", runner.Athlete, "update", new { authorized = "false" });
        await factory.SyncAsync();

        (await runner.Completions()).GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task A_run_arriving_days_late_completes_the_session_of_the_runners_local_day()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);

        // 22:30 UTC on Tuesday is half past midnight on Wednesday in Johannesburg; it arrives a week later.
        await runner.Synced(new DateTimeOffset(2026, 10, 20, 22, 30, 0, TimeSpan.Zero), Metres(runner.On("2026-10-21")));

        var completion = (await runner.Completions()).EnumerateArray().ShouldHaveSingleItem();
        completion.GetProperty("date").GetString().ShouldBe("2026-10-21");
        completion.GetProperty("sessionType").GetString().ShouldBe(runner.On("2026-10-21").GetProperty("type").GetString());
        completion.GetProperty("feedback").GetString().ShouldBe("Near");
    }

    [Fact]
    public async Task Uploading_the_file_of_a_synced_run_counts_it_once_as_the_runners_own_upload()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);
        var start = Morning("2026-10-19");
        var metres = Metres(runner.On("2026-10-19"));
        await runner.Synced(start, metres);

        var bytes = new ByteArrayContent(FitFiles.Run(start.UtcDateTime, metres, 360));
        bytes.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
        using var file = new MultipartFormDataContent { { bytes, "file", "run.fit" } };
        (await runner.Client.PostAsync(Url("/api/v1/me/activities"), file)).StatusCode.ShouldBe(HttpStatusCode.Created);
        await factory.SyncAsync();

        (await Json(await runner.Client.GetAsync(Url("/api/v1/me/activities")))).GetArrayLength().ShouldBe(1);
        (await runner.Completions()).GetArrayLength().ShouldBe(0);
        (await runner.AdherenceDone()).ShouldBe(1);
    }

    [Fact]
    public async Task Strength_and_rest_days_two_runs_in_a_day_and_trivial_runs_complete_nothing()
    {
        await using var factory = new StravaApiFactory();
        var runner = await Runner(factory);

        await runner.Synced(Morning("2026-10-22"), 8000); // Thursday: strength only
        await runner.Synced(Morning("2026-10-24"), 8000); // Saturday: rest
        await runner.Synced(Morning("2026-10-23"), 5000); // Friday, twice: which one was the session?
        await runner.Synced(Morning("2026-10-23").AddHours(9), 6000);
        await runner.Synced(Morning("2026-10-25"), 500); // Sunday: 500 m in 3 minutes

        (await runner.Completions()).GetArrayLength().ShouldBe(0);
        (await runner.AdherenceDone()).ShouldBe(0);
    }
}
