using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Domain.Activities;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>Sequences a runner actually takes: log, edit answers, edit again, reopen, then edit the old run.</summary>
public sealed class PlanEditHistoryTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 29, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly RunDay = new(2026, 10, 28);
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private static object Answers(bool changed, bool moveStart = false) => new
    {
        raceName = "History 10K",
        distanceKm = 10,
        raceDate = "2026-12-13",
        goalTime = changed ? "00:50:00" : "00:52:00",
        runDays = changed ? new[] { "Tuesday", "Thursday", "Saturday", "Sunday" } : new[] { "Monday", "Wednesday", "Friday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 25,
        strengthDays = changed ? new[] { "Monday" } : [],
        planFrom = "2026-10-08",
        startOn = moveStart ? "2026-11-02" : (string?)null,
    };

    private static async Task<(HttpClient Client, Guid Runner)> Runner(AutomaticTotalsFactory factory)
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        var profile = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "History QA", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        return (client, profile.GetProperty("id").GetGuid());
    }

    [Theory]
    [InlineData("manual")]
    [InlineData("time-only")]
    [InlineData("plain-tick")]
    [InlineData("strava")]
    [InlineData("upload")]
    [InlineData("additional")]
    public async Task Changing_days_strength_goal_and_start_preserves_original_run_and_its_identity(string mode)
    {
        await using var factory = new AutomaticTotalsFactory();
        factory.Time.SetUtcNow(Now);
        var (client, runner) = await Runner(factory);
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Answers(false) }));
        var id = saved.GetProperty("id").GetGuid();
        var original = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        var session = original.GetProperty("plan").GetProperty("weeks").EnumerateArray().SelectMany(week => week.GetProperty("sessions").EnumerateArray())
            .Single(s => s.GetProperty("date").GetString() == "2026-10-28" && s.GetProperty("type").GetString() != "Strength");
        var type = session.GetProperty("type").GetString();
        var prescribed = session.GetProperty("distanceKm").GetDouble();
        Guid? activityId = null;
        if (mode is "strava" or "upload")
        {
            var recording = new ActivityRecording(new(2026, 10, 28, 6, 0, 0, TimeSpan.Zero), ActivityKind.Run,
                [new(TimeSpan.Zero, 0), new(TimeSpan.FromMinutes(70), 10000)], DeviceTotals.None);
            var activity = Activity.Record(runner, recording, RunDay, [], mode == "strava" ? ActivityOrigin.Strava(123, Now, false) : null);
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            db.Activities.Add(activity);
            await db.SaveChangesAsync();
            activityId = activity.Id;
        }

        var path = mode == "additional" ? $"additional/{Guid.NewGuid()}/2026-10-28/Easy" : $"2026-10-28/{type}";
        var logged = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/{path}"), new
        {
            status = "Done",
            effort = 3,
            note = "Wednesday happened",
            activityId,
            distanceKm = mode is "manual" or "additional" ? 10 : (double?)null,
            duration = mode is "manual" or "time-only" or "additional" ? "01:09:59" : null,
            distanceUnreported = mode is "time-only" or "strava" or "upload",
        }));
        var entryId = logged.GetProperty("id").GetGuid();
        // Include a legacy completion whose prescription has not yet been captured.
        if (mode == "plain-tick")
        {
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().Database.ExecuteSqlInterpolatedAsync($"UPDATE SessionCheckIns SET PrescribedKm = NULL WHERE Id = {entryId}");
        }

        factory.Time.Advance(TimeSpan.FromHours(1));
        foreach (var moveStart in new[] { false, true })
        {
            var updated = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Answers(true, moveStart), replaceCurrent = true, expectedPlanId = id }));
            updated.GetProperty("id").GetGuid().ShouldBe(id);
            var reopened = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
            reopened.GetProperty("inputs").GetProperty("runDays").EnumerateArray().Select(day => day.GetString()).ShouldNotContain("Wednesday");
            var history = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/check-ins")));
            var entry = history.EnumerateArray().ShouldHaveSingleItem();
            entry.GetProperty("id").GetGuid().ShouldBe(entryId);
            entry.GetProperty("date").GetString().ShouldBe("2026-10-28");
            entry.GetProperty("note").GetString().ShouldBe("Wednesday happened");
            entry.GetProperty("updatedAt").GetDateTimeOffset().ShouldBe(logged.GetProperty("updatedAt").GetDateTimeOffset());
            if (mode != "additional") entry.GetProperty("prescribedKm").GetDouble().ShouldBe(prescribed);
            var totals = await Json(await client.GetAsync(Url("/api/v1/me/running?includeSynced=true")));
            var total = totals.EnumerateArray().ShouldHaveSingleItem();
            total.GetProperty("distanceKm").GetDouble().ShouldBe(mode == "plain-tick" ? prescribed : mode == "time-only" ? 0 : 10);
        }

        if (mode == "strava")
        {
            factory.Time.Advance(TimeSpan.FromDays(8));
            var expired = await Json(await client.GetAsync(Url("/api/v1/me/running?includeSynced=true")));
            expired.EnumerateArray().ShouldHaveSingleItem().GetProperty("distanceUnreported").GetBoolean().ShouldBeTrue();
            var retained = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/check-ins")));
            retained.EnumerateArray().ShouldHaveSingleItem().GetProperty("distanceKm").ValueKind.ShouldBe(JsonValueKind.Null);
        }
        // The old date/type may now be outside the schedule, but the runner can still correct their own saved entry.
        var corrected = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/{path}"), new { status = "Done", effort = 4, distanceKm = 9, duration = "01:05:00", note = "Corrected" }));
        corrected.GetProperty("id").GetGuid().ShouldBe(entryId);
        var reloaded = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/check-ins")));
        reloaded.EnumerateArray().ShouldHaveSingleItem().GetProperty("distanceKm").GetDouble().ShouldBe(9);
        // A new invented historical session is still rejected; this is permission to edit history, not create fake prescriptions.
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/2026-10-27/Tempo"), new { status = "Done", effort = 4 })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Failed_or_stale_edits_cannot_replace_the_current_plan_or_erase_runs()
    {
        await using var factory = new AutomaticTotalsFactory();
        factory.Time.SetUtcNow(Now);
        var (client, _) = await Runner(factory);
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Answers(false) }));
        var id = saved.GetProperty("id").GetGuid();
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/additional/{Guid.NewGuid()}/2026-10-28/Easy"), new { status = "Done", effort = 3, distanceKm = 10 })).EnsureSuccessStatusCode();
        (await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Answers(true), replaceCurrent = true, expectedPlanId = Guid.NewGuid() })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Invalid", distanceKm = -1 }, replaceCurrent = true, expectedPlanId = id })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var plans = await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        plans.EnumerateArray().ShouldHaveSingleItem().GetProperty("id").GetGuid().ShouldBe(id);
        var history = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/check-ins")));
        history.EnumerateArray().ShouldHaveSingleItem().GetProperty("distanceKm").GetDouble().ShouldBe(10);
        var (other, _) = await Runner(factory);
        (await other.GetAsync(Url($"/api/v1/me/plans/{id}/check-ins"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
    [Fact]
    public async Task An_old_edit_cannot_replace_a_new_race_saved_in_another_tab()
    {
        await using var factory = new AutomaticTotalsFactory();
        factory.Time.SetUtcNow(Now);
        var (client, _) = await Runner(factory);
        var original = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Answers(false) }));
        var originalId = original.GetProperty("id").GetGuid();
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{originalId}/check-ins/additional/{Guid.NewGuid()}/2026-10-28/Easy"), new { status = "Done", effort = 3, distanceKm = 10 })).EnsureSuccessStatusCode();
        var next = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            plan = new { raceName = "Next race", distanceKm = 10, raceDate = "2027-01-10", goalTime = "00:52:00", runDays = new[] { "Tuesday", "Thursday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 25 },
            replaceCurrent = true,
        }));
        var nextId = next.GetProperty("id").GetGuid();
        (await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Answers(true), replaceCurrent = true, expectedPlanId = originalId })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var plans = await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        plans.EnumerateArray().Single(p => p.GetProperty("status").GetString() == "Active").GetProperty("id").GetGuid().ShouldBe(nextId);
        plans.EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == originalId).GetProperty("status").GetString().ShouldBe("Archived");
        var totals = await Json(await client.GetAsync(Url("/api/v1/me/running")));
        totals.EnumerateArray().ShouldHaveSingleItem().GetProperty("distanceKm").GetDouble().ShouldBe(10);
    }

    [Fact]
    public async Task Deleting_a_training_plan_keeps_its_recorded_runs_and_totals()
    {
        await using var factory = new AutomaticTotalsFactory();
        factory.Time.SetUtcNow(Now);
        var (client, _) = await Runner(factory);
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = Answers(false) }));
        var id = saved.GetProperty("id").GetGuid();
        var path = $"/api/v1/me/plans/{id}/check-ins/additional/{Guid.NewGuid()}/2026-10-28/Easy";
        (await client.PutAsJsonAsync(Url(path), new { status = "Done", effort = 3, distanceKm = 10, duration = "01:09:59" })).EnsureSuccessStatusCode();
        (await client.DeleteAsync(Url($"/api/v1/me/plans/{id}"))).EnsureSuccessStatusCode();
        var plans = await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        plans.EnumerateArray().ShouldHaveSingleItem().GetProperty("status").GetString().ShouldBe("Archived");
        var totals = await Json(await client.GetAsync(Url("/api/v1/me/running")));
        totals.EnumerateArray().ShouldHaveSingleItem().GetProperty("distanceKm").GetDouble().ShouldBe(10);
        var history = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/check-ins")));
        history.GetArrayLength().ShouldBe(1);
    }

}
