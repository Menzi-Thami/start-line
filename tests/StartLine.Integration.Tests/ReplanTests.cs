using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

/// <summary>
/// "Replan from here", through the API: stateless for shared links, stored for saved plans, and always with the plan's
/// own generator version. Its own factory, because these tests move the clock on to the day of the setback.
/// </summary>
public sealed class ReplanTests : IClassFixture<ReplanClockFactory>
{
    private static readonly DateTimeOffset SetbackDay = new(2026, 12, 3, 7, 0, 0, TimeSpan.Zero);

    private static readonly object Profile = new
    {
        displayName = "Sipho",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    // Built on 8 October for a half marathon on 14 February.
    private static readonly Dictionary<string, object?> HalfPlan = new()
    {
        ["raceName"] = "Valentine's Half",
        ["distanceKm"] = 21.0975,
        ["raceDate"] = "2027-02-14",
        ["goalTime"] = "01:50:00",
        ["runDays"] = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        ["longRunDay"] = "Sunday",
        ["currentWeeklyKm"] = 30,
        ["planFrom"] = "2026-10-08",
    };

    private readonly ReplanClockFactory _factory;

    public ReplanTests(ReplanClockFactory factory)
    {
        _factory = factory;
        if (factory.Time.GetUtcNow() < SetbackDay)
        {
            factory.Time.SetUtcNow(SetbackDay);
        }
    }

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static Dictionary<string, object?> With(params (string Key, object? Value)[] extra)
    {
        var plan = new Dictionary<string, object?>(HalfPlan);
        foreach (var (key, value) in extra)
        {
            plan[key] = value;
        }

        return plan;
    }

    private async Task<(HttpClient Client, Guid Id)> SavedHalf()
    {
        var client = _factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        var response = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = HalfPlan });
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (client, (await Json(response)).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task A_shared_plan_can_be_replanned_without_an_account()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"),
            With(("replanFrom", "2026-12-03"), ("setback", "Injury")));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var plan = await Json(response);
        // Sixteen weeks at most for a half, so the plan starts on 26 October; the replan keeps that start.
        plan.GetProperty("startDate").GetString().ShouldBe("2026-10-26");
        plan.GetProperty("replan").GetProperty("setback").GetString().ShouldBe("Injury");
        plan.GetProperty("replan").GetProperty("from").GetString().ShouldBe("2026-12-03");
        var weeks = plan.GetProperty("weeks").EnumerateArray().ToList();
        weeks.First().GetProperty("isReplanned").GetBoolean().ShouldBeFalse();
        weeks.Last().GetProperty("isReplanned").GetBoolean().ShouldBeTrue();
        plan.GetProperty("warnings").EnumerateArray().ShouldContain(w => w.GetProperty("code").GetString() == "injury");
    }

    [Fact]
    public async Task Running_behind_needs_last_weeks_distance()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"),
            With(("replanFrom", "2026-12-03"), ("setback", "Behind")));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("errors").TryGetProperty("RecentWeeklyKm", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task A_replan_too_close_to_the_race_is_rejected()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"),
            With(("raceDate", "2026-12-12"), ("replanFrom", "2026-12-03"), ("setback", "Illness")));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("errors").TryGetProperty("ReplanFrom", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task A_saved_plan_is_replanned_and_my_plans_says_so()
    {
        var (client, id) = await SavedHalf();

        var response = await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/replan"),
            new { replanFrom = "2026-12-03", setback = "Illness", recentWeeklyKm = 10 });

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var saved = await Json(response);
        saved.GetProperty("plan").GetProperty("replan").GetProperty("setback").GetString().ShouldBe("Illness");
        saved.GetProperty("inputs").GetProperty("recentWeeklyKm").GetDouble().ShouldBe(10);

        var reopened = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        reopened.GetProperty("plan").GetProperty("replan").GetProperty("from").GetString().ShouldBe("2026-12-03");

        var list = await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        list[0].GetProperty("replannedFrom").GetString().ShouldBe("2026-12-03");
    }

    [Fact]
    public async Task A_second_replan_replaces_the_first_and_undo_restores_the_original()
    {
        var (client, id) = await SavedHalf();
        (await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/replan"), new { replanFrom = "2026-12-02", setback = "MissedTraining" }))
            .EnsureSuccessStatusCode();

        var second = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/replan"), new { replanFrom = "2026-12-03", setback = "Injury" }));
        second.GetProperty("plan").GetProperty("replan").GetProperty("setback").GetString().ShouldBe("Injury");

        var undone = await client.DeleteAsync(Url($"/api/v1/me/plans/{id}/replan"));
        undone.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Json(undone)).GetProperty("plan").GetProperty("replan").ValueKind.ShouldBe(JsonValueKind.Null);
        (await Json(await client.GetAsync(Url("/api/v1/me/plans"))))[0].GetProperty("replannedFrom").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task A_replan_from_a_day_still_to_come_is_rejected()
    {
        var (client, id) = await SavedHalf();

        var response = await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/replan"), new { replanFrom = "2026-12-20", setback = "Illness" });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Another_runner_cannot_replan_my_plan()
    {
        var (_, id) = await SavedHalf();
        var someoneElse = _factory.CreateClient().As(Guid.NewGuid().ToString());
        (await someoneElse.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();

        var response = await someoneElse.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/replan"), new { replanFrom = "2026-12-03", setback = "Illness" });

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    private static List<double> WeeklyKm(JsonElement plan) =>
        [.. plan.GetProperty("weeks").EnumerateArray().Select(w => w.GetProperty("plannedKm").GetDouble())];

    [Fact]
    public async Task A_saved_plan_keeps_its_generator_version_and_replans_with_it()
    {
        var client = _factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = With(("version", 2)) });
        saved.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await Json(saved)).GetProperty("id").GetGuid();

        var reopened = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        reopened.GetProperty("inputs").GetProperty("version").GetInt32().ShouldBe(2);
        var shared = await Json(await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"), With(("version", 2))));
        WeeklyKm(reopened.GetProperty("plan")).ShouldBe(WeeklyKm(shared));

        // The rebuild is the version 2 plan's rebuild, exactly as its shared link would give it.
        var replanned = await Json(await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/replan"), new { replanFrom = "2026-12-03", setback = "Illness" }));
        var sharedReplan = await Json(await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"),
            With(("version", 2), ("replanFrom", "2026-12-03"), ("setback", "Illness"))));
        WeeklyKm(replanned.GetProperty("plan")).ShouldBe(WeeklyKm(sharedReplan));
        replanned.GetProperty("inputs").GetProperty("version").GetInt32().ShouldBe(2);
    }

    [Fact]
    public async Task A_plan_saved_without_a_version_stays_version_1()
    {
        var (client, id) = await SavedHalf();

        var reopened = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        reopened.GetProperty("inputs").GetProperty("version").GetInt32().ShouldBe(1);
        var v1 = await Json(await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"), With(("version", 1))));
        var v2 = await Json(await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"), With(("version", 2))));
        WeeklyKm(reopened.GetProperty("plan")).ShouldBe(WeeklyKm(v1));
        WeeklyKm(v2).ShouldNotBe(WeeklyKm(v1));
    }

    [Fact]
    public async Task A_link_from_an_unknown_generator_version_is_rejected()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync(Url("/api/v1/plans"), With(("version", 3)));

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("errors").TryGetProperty("Version", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task A_saved_plan_keeps_the_day_the_runner_chose_to_start()
    {
        var client = _factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        // Thursday 5 November: a short first week, then Monday to Sunday.
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = With(("startOn", "2026-11-05")) });
        saved.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await Json(saved)).GetProperty("id").GetGuid();

        var reopened = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        reopened.GetProperty("inputs").GetProperty("startOn").GetString().ShouldBe("2026-11-05");
        reopened.GetProperty("plan").GetProperty("startDate").GetString().ShouldBe("2026-11-05");
    }
}

/// <summary>A factory of its own, so moving its clock on never moves another test class's.</summary>
public sealed class ReplanClockFactory : StartLineApiFactory;
