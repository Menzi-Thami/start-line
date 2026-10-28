using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>Run check-ins, through the API. Its own factory, because the clock moves on into the plan.</summary>
public sealed class CheckInTests : IClassFixture<CheckInClockFactory>
{
    // A Wednesday in the plan's first week (the plan runs from Monday 12 October).
    private static readonly DateTimeOffset InThePlan = new(2026, 10, 14, 18, 0, 0, TimeSpan.Zero);

    private static readonly object Profile = new
    {
        displayName = "Lerato",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    private static readonly object TenK = new
    {
        raceName = "Summer 10K",
        distanceKm = 10,
        raceDate = "2026-12-13",
        goalTime = "00:52:00",
        runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 25,
        planFrom = "2026-10-08",
    };

    private readonly CheckInClockFactory _factory;

    public CheckInTests(CheckInClockFactory factory)
    {
        _factory = factory;
        if (factory.Time.GetUtcNow() < InThePlan)
        {
            factory.Time.SetUtcNow(InThePlan);
        }
    }

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<HttpClient> Runner()
    {
        var client = _factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        return client;
    }

    /// <summary>Saves the 10K plan and finds its first run (on Tuesday 13 October).</summary>
    private static async Task<(Guid Plan, string Date, string Type)> TenKPlan(HttpClient client)
    {
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = TenK, replaceCurrent = true });
        saved.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await Json(saved)).GetProperty("id").GetGuid();
        var full = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        var run = full.GetProperty("plan").GetProperty("weeks")[0].GetProperty("sessions").EnumerateArray()
            .First(s => s.GetProperty("type").GetString() is not ("Strength" or "Race"));
        run.GetProperty("date").GetString().ShouldBe("2026-10-13");
        return (id, run.GetProperty("date").GetString()!, run.GetProperty("type").GetString()!);
    }

    [Fact]
    public async Task A_run_is_checked_in_and_listed()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);

        var response = await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"),
            new { status = "Done", effort = 6, pain = "Niggle", painArea = "Calf", distanceKm = 7.5, duration = "00:42:10", note = "Hot day" });

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var list = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")))).EnumerateArray().ToList();
        var checkIn = list.ShouldHaveSingleItem();
        checkIn.GetProperty("effort").GetInt32().ShouldBe(6);
        checkIn.GetProperty("painArea").GetString().ShouldBe("Calf");
        checkIn.GetProperty("duration").GetString().ShouldBe("00:42:10");
    }

    [Fact]
    public async Task Checking_in_again_replaces_the_answers()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);
        var url = Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}");

        (await client.PutAsJsonAsync(url, new { status = "Done", effort = 5 })).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync(url, new { status = "CutShort", effort = 9 })).EnsureSuccessStatusCode();

        var list = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")))).EnumerateArray().ToList();
        list.ShouldHaveSingleItem().GetProperty("status").GetString().ShouldBe("CutShort");
    }

    [Fact]
    public async Task A_run_that_is_not_in_the_plan_that_day_is_rejected()
    {
        var client = await Runner();
        var (plan, _, _) = await TenKPlan(client);

        // Monday is a rest day in this plan.
        var response = await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/2026-10-12/Easy"), new { status = "Done", effort = 3 });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_run_still_to_come_cannot_be_checked_in_on()
    {
        var client = await Runner();
        var (plan, _, type) = await TenKPlan(client);

        var response = await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/2026-11-17/{type}"), new { status = "Done", effort = 3 });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("errors").TryGetProperty("Date", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task A_run_cut_short_needs_an_effort()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);

        var response = await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"), new { status = "CutShort" });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("errors").TryGetProperty("Effort", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task A_plain_done_is_a_tick_with_no_effort()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);

        var response = await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"), new { status = "Done" });

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Json(response)).GetProperty("effort").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task Another_runner_cannot_see_or_add_check_ins()
    {
        var me = await Runner();
        var (plan, date, type) = await TenKPlan(me);
        var someoneElse = await Runner();

        (await someoneElse.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await someoneElse.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"), new { status = "Done", effort = 5 }))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_check_in_can_be_taken_back()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);
        var url = Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}");
        (await client.PutAsJsonAsync(url, new { status = "Skipped" })).EnsureSuccessStatusCode();

        (await client.DeleteAsync(url)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.DeleteAsync(url)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")))).GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task A_past_plan_is_read_only()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);
        // A plan for another race replaces it, so the 10K becomes a past plan.
        var half = new
        {
            raceName = "Spring Half",
            distanceKm = 21.1,
            raceDate = "2027-02-14",
            goalTime = "01:55:00",
            runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
            longRunDay = "Sunday",
            planFrom = "2026-10-12",
        };
        (await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = half, replaceCurrent = true })).StatusCode.ShouldBe(HttpStatusCode.Created);

        var response = await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"), new { status = "Done", effort = 5 });

        response.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Json(response)).GetProperty("code").GetString().ShouldBe("plan_archived");
    }

    [Fact]
    public async Task Check_ins_go_out_with_the_account_export_and_go_with_their_plan()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"), new { status = "Done", effort = 4 })).EnsureSuccessStatusCode();

        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        export.GetProperty("checkIns")[0].GetProperty("planId").GetGuid().ShouldBe(plan);

        (await client.DeleteAsync(Url($"/api/v1/me/plans/{plan}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        using var scope = _factory.Services.CreateScope();
        (await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().SessionCheckIns.CountAsync(c => c.SavedPlanId == plan)).ShouldBe(0);
    }
    [Fact]
    public async Task A_different_run_survives_a_new_session_without_rewriting_the_plan()
    {
        var subject = Guid.NewGuid().ToString();
        var client = _factory.CreateClient().As(subject);
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        var (plan, date, type) = await TenKPlan(client);
        var before = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}")));
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"),
            new { status = "Done", actualSessionType = "LongRun", effort = 3, distanceKm = 10, duration = "01:02:03" })).EnsureSuccessStatusCode();
        var again = _factory.CreateClient().As(subject);
        var entries = await Json(await again.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")));
        entries[0].GetProperty("actualSessionType").GetString().ShouldBe("LongRun");
        entries[0].GetProperty("distanceKm").GetDouble().ShouldBe(10);
        entries[0].GetProperty("duration").GetString().ShouldBe("01:02:03");
        var after = await Json(await again.GetAsync(Url($"/api/v1/me/plans/{plan}")));
        after.GetProperty("plan").ToString().ShouldBe(before.GetProperty("plan").ToString());
    }

    [Fact]
    public async Task Additional_runs_are_idempotent_separate_entries_and_time_alone_has_no_kilometres()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);
        var id = Guid.NewGuid();
        var url = Url($"/api/v1/me/plans/{plan}/check-ins/additional/{id}/{date}/Easy");
        var body = new { status = "Done", actualSessionType = "Easy", duration = "00:42:10", distanceUnreported = true };
        (await client.PutAsJsonAsync(url, body)).EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync(url, body)).EnsureSuccessStatusCode();
        var entries = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")))).EnumerateArray().ToList();
        entries.ShouldHaveSingleItem().GetProperty("isAdditional").GetBoolean().ShouldBeTrue();
        (await Json(await client.GetAsync(Url("/api/v1/me/running")))).GetArrayLength().ShouldBe(0);
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}"), new { status = "Done", distanceKm = 10 })).EnsureSuccessStatusCode();
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")))).GetArrayLength().ShouldBe(2);
        (await client.DeleteAsync(Url($"/api/v1/me/plans/{plan}/check-ins/additional/{id}"))).EnsureSuccessStatusCode();
        var remaining = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/check-ins")))).EnumerateArray().ToList();
        remaining.ShouldHaveSingleItem().GetProperty("isAdditional").GetBoolean().ShouldBeFalse();
    }

    [Fact]
    public async Task Only_an_owned_same_day_import_can_be_used_once_and_no_imported_metrics_are_copied()
    {
        var client = await Runner();
        var (plan, date, type) = await TenKPlan(client);
        var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(FitFiles.Run(new DateTime(2026, 10, 13, 5, 0, 0, DateTimeKind.Utc), 10000, 360)), "file", "actual.fit");
        var upload = await client.PostAsync(Url("/api/v1/me/activities"), content);
        upload.EnsureSuccessStatusCode();
        var activityId = (await Json(upload)).GetProperty("id").GetGuid();
        var url = Url($"/api/v1/me/plans/{plan}/check-ins/{date}/{type}");
        (await client.PutAsJsonAsync(url, new { status = "Done", activityId, distanceUnreported = true })).EnsureSuccessStatusCode();
        var duplicate = await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/additional/{Guid.NewGuid()}/{date}/Easy"),
            new { status = "Done", activityId, distanceUnreported = true });
        duplicate.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var copied = await client.PutAsJsonAsync(url, new { status = "Done", activityId, distanceUnreported = true, distanceKm = 10 });
        copied.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var foreign = await client.PutAsJsonAsync(url, new { status = "Done", activityId = Guid.NewGuid(), distanceUnreported = true });
        foreign.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

}

/// <summary>A factory of its own, so moving its clock on never moves another test class's.</summary>
public sealed class CheckInClockFactory : StartLineApiFactory;
