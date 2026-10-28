using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

/// <summary>The weekly coach through the API. Its own factory: the clock sits on the Monday of the plan's second week.</summary>
public sealed class CoachTests : IClassFixture<CoachClockFactory>
{
    // 07:00 in Johannesburg on Monday 19 October: week 2 of a plan that started on Monday 12 October.
    private static readonly DateTimeOffset WeekTwoMonday = new(2026, 10, 19, 5, 0, 0, TimeSpan.Zero);

    private static readonly object Profile = new
    {
        displayName = "Sizwe",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    private static Dictionary<string, object?> TenK() => new()
    {
        ["raceName"] = "Summer 10K",
        ["distanceKm"] = 10,
        ["raceDate"] = "2026-12-13",
        ["goalTime"] = "00:52:00",
        ["runDays"] = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        ["longRunDay"] = "Sunday",
        ["currentWeeklyKm"] = 25,
        ["planFrom"] = "2026-10-08",
    };

    private readonly CoachClockFactory _factory;

    public CoachTests(CoachClockFactory factory)
    {
        _factory = factory;
        if (factory.Time.GetUtcNow() < WeekTwoMonday)
        {
            factory.Time.SetUtcNow(WeekTwoMonday);
        }
    }

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<(HttpClient Client, Guid Plan, JsonElement Original)> SavedTenK(Dictionary<string, object?>? plan = null)
    {
        var client = _factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = plan ?? TenK() });
        saved.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await Json(saved)).GetProperty("id").GetGuid();
        var original = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan");
        return (client, id, original);
    }

    /// <summary>Checks in on every run of week 1, each as hard as <paramref name="effort"/>.</summary>
    private static async Task CheckInWeekOne(HttpClient client, Guid plan, JsonElement original, int effort)
    {
        foreach (var run in original.GetProperty("weeks")[0].GetProperty("sessions").EnumerateArray()
            .Where(s => s.GetProperty("type").GetString() is not ("Strength" or "Race")))
        {
            var url = Url($"/api/v1/me/plans/{plan}/check-ins/{run.GetProperty("date").GetString()}/{run.GetProperty("type").GetString()}");
            (await client.PutAsJsonAsync(url, new { status = "Done", effort })).EnsureSuccessStatusCode();
        }
    }

    private static async Task<JsonElement> AcceptCoaching(HttpClient client, Guid plan)
    {
        var preview = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/coach/proposal")));
        var response = await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{plan}/coach/apply"), new { token = preview.GetProperty("token").GetString() });
        response.EnsureSuccessStatusCode();
        return (await Json(response)).GetProperty("proposed");
    }

    [Fact]
    public async Task Opening_and_previewing_never_apply_a_training_change()
    {
        var (client, plan, original) = await SavedTenK();
        await CheckInWeekOne(client, plan, original, 9);
        var opened = await Json(await client.PostAsync(Url($"/api/v1/me/plans/{plan}/coach"), null));
        opened.GetProperty("coaching").GetArrayLength().ShouldBe(0);
        var preview = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/coach/proposal")));
        preview.GetProperty("hasChanges").GetBoolean().ShouldBeTrue();
        var unchanged = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}")));
        unchanged.GetProperty("plan").ToString().ShouldBe(original.ToString());
        unchanged.GetProperty("coaching").GetArrayLength().ShouldBe(0);
        await CheckInWeekOne(client, plan, original, 4);
        var stale = await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{plan}/coach/apply"), new { token = preview.GetProperty("token").GetString() });
        stale.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task A_midweek_proposal_cannot_rewrite_workouts_on_past_dates()
    {
        await using var factory = new CoachClockFactory();
        var isolated = new CoachTests(factory);
        var (client, plan, original) = await isolated.SavedTenK();
        await CheckInWeekOne(client, plan, original, 9);
        factory.Time.SetUtcNow(WeekTwoMonday.AddDays(2));
        var preview = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}/coach/proposal")));
        preview.GetProperty("canApply").GetBoolean().ShouldBeFalse();
        preview.GetProperty("proposed").GetProperty("plan").ToString().ShouldBe(original.ToString());
        var apply = await client.PostAsJsonAsync(Url($"/api/v1/me/plans/{plan}/coach/apply"), new { token = preview.GetProperty("token").GetString() });
        apply.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    private static double WeekKm(JsonElement plan, int index) => plan.GetProperty("weeks")[index].GetProperty("plannedKm").GetDouble();

    [Fact]
    public async Task A_week_that_felt_too_hard_holds_this_week_and_says_why()
    {
        var (client, plan, original) = await SavedTenK();
        await CheckInWeekOne(client, plan, original, effort: 9);

        var coached = await AcceptCoaching(client, plan);

        var call = coached.GetProperty("coaching").EnumerateArray().ShouldHaveSingleItem();
        call.GetProperty("weekStart").GetString().ShouldBe("2026-10-19");
        call.GetProperty("verdict").GetString().ShouldBe("Struggling");
        call.GetProperty("reasons").EnumerateArray().Select(r => r.GetString()).ShouldContain("FeltHarderThanPlanned");
        var weeks = coached.GetProperty("plan");
        WeekKm(weeks, 1).ShouldBeLessThanOrEqualTo(WeekKm(weeks, 0));
        WeekKm(weeks, 0).ShouldBe(WeekKm(original, 0));
    }

    [Fact]
    public async Task Without_check_ins_the_week_runs_as_written()
    {
        var (client, plan, original) = await SavedTenK();

        var coached = await AcceptCoaching(client, plan);

        coached.GetProperty("coaching")[0].GetProperty("verdict").GetString().ShouldBe("NotEnoughToGoOn");
        coached.GetProperty("plan").GetProperty("weeks").ToString().ShouldBe(original.GetProperty("weeks").ToString());
    }

    [Fact]
    public async Task The_call_is_made_once_a_week_and_kept()
    {
        var (client, plan, original) = await SavedTenK();
        await CheckInWeekOne(client, plan, original, effort: 9);
        await AcceptCoaching(client, plan);

        // Feeling better about it afterwards doesn't remake this week's call.
        await CheckInWeekOne(client, plan, original, effort: 4);
        var again = await Json(await client.PostAsync(Url($"/api/v1/me/plans/{plan}/coach"), null));
        var reopened = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{plan}")));

        again.GetProperty("coaching").EnumerateArray().ShouldHaveSingleItem().GetProperty("verdict").GetString().ShouldBe("Struggling");
        reopened.GetProperty("coaching").GetArrayLength().ShouldBe(1);
        reopened.GetProperty("plan").GetProperty("weeks").ToString().ShouldBe(again.GetProperty("plan").GetProperty("weeks").ToString());
    }

    [Fact]
    public async Task A_replan_last_week_is_not_judged_again()
    {
        var replanned = TenK();
        replanned["replanFrom"] = "2026-10-14";
        replanned["setback"] = "Illness";
        var (client, plan, original) = await SavedTenK(replanned);
        await CheckInWeekOne(client, plan, original, effort: 9);

        var coached = await AcceptCoaching(client, plan);

        var call = coached.GetProperty("coaching")[0];
        call.GetProperty("verdict").GetString().ShouldBe("OnTrack");
        call.GetProperty("reasons")[0].GetString().ShouldBe("JustReplanned");
    }

    [Fact]
    public async Task The_coachs_calls_go_out_with_the_account_export()
    {
        var (client, plan, _) = await SavedTenK();
        await AcceptCoaching(client, plan);

        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));

        export.GetProperty("coaching")[0].GetProperty("planId").GetGuid().ShouldBe(plan);
    }

    private static double PaceOf(JsonElement plan, string zone) =>
        plan.GetProperty("paces").EnumerateArray().Single(p => p.GetProperty("zone").GetString() == zone).GetProperty("slowestSecondsPerKm").GetDouble();

    [Fact]
    public async Task A_recorded_run_slower_than_the_goal_sets_this_weeks_paces()
    {
        var (client, plan, original) = await SavedTenK();

        // A steady 6 km at 5:50/km last Wednesday: about a 59-minute 10K today, slower than the 52-minute goal.
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(FitFiles.Run(new DateTime(2026, 10, 14, 5, 0, 0, DateTimeKind.Utc), 6000, 350));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(file, "file", "run.fit");
        (await client.PostAsync(Url("/api/v1/me/activities"), content)).StatusCode.ShouldBe(HttpStatusCode.Created);

        var coached = await AcceptCoaching(client, plan);

        var fitness = TimeSpan.Parse(coached.GetProperty("coaching")[0].GetProperty("fitness").GetString()!, System.Globalization.CultureInfo.InvariantCulture);
        fitness.TotalMinutes.ShouldBeInRange(55, 62);
        var paced = coached.GetProperty("plan");
        PaceOf(paced, "Easy").ShouldBeGreaterThan(PaceOf(original, "Easy"));
        PaceOf(paced, "Race").ShouldBe(PaceOf(original, "Race"));
    }

    [Fact]
    public async Task Without_a_watch_hard_sessions_that_felt_too_hard_ease_the_paces()
    {
        var (client, plan, original) = await SavedTenK();
        await CheckInWeekOne(client, plan, original, effort: 10);

        var coached = await AcceptCoaching(client, plan);

        coached.GetProperty("coaching")[0].GetProperty("paceFactor").GetDouble().ShouldBe(1.02);
        PaceOf(coached.GetProperty("plan"), "Tempo").ShouldBeGreaterThan(PaceOf(original, "Tempo"));
    }

    [Fact]
    public async Task Another_runner_cannot_coach_my_plan()
    {
        var (_, plan, _) = await SavedTenK();
        var someoneElse = _factory.CreateClient().As(Guid.NewGuid().ToString());
        (await someoneElse.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();

        (await someoneElse.PostAsync(Url($"/api/v1/me/plans/{plan}/coach"), null)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}

/// <summary>A factory of its own, so moving its clock on never moves another test class's.</summary>
public sealed class CoachClockFactory : StartLineApiFactory;
