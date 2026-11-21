using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>The retired AI settings switched on, as an old staging configuration might still have them.</summary>
public sealed class RetiredAiSettingsApiFactory : StartLineApiFactory
{
    protected override IDictionary<string, string?> Settings => new Dictionary<string, string?>
    {
        ["AiCoach:Enabled"] = "true",
        ["AiCoach:ApiKey"] = "test-key-not-real",
        ["AiCoach:McpEnabled"] = "true",
    };
}

/// <summary>
/// Exact changes to one upcoming run through the API and a real database: Taperday's rules only, no AI and no feature flag.
/// Previewed, applied only as seen, held to the runner's own plan and local day, undone as written. The retired AI coach (#294)
/// stays gone even with its old settings on. The staging QA cases from PR #296 run here against the same kind of plan.
/// </summary>
public sealed class SessionAdjustmentTests
{
    // Monday 2 November, 07:00 in Johannesburg.
    private static readonly DateTimeOffset MondayMorning = new(2026, 11, 2, 5, 0, 0, TimeSpan.Zero);
    // Saturday 21 November, 08:00 in Johannesburg: the day of the staging QA, two days before the plan starts.
    private static readonly DateTimeOffset QaSaturday = new(2026, 11, 21, 6, 0, 0, TimeSpan.Zero);
    private static readonly string[] Steady = ["Easy", "Recovery", "EasyWithStrides", "LongRun", "MediumLongRun"];

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        return JsonDocument.Parse(body).RootElement;
    }

    private static IEnumerable<JsonElement> Sessions(JsonElement plan) => plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray());

    private static JsonElement Run(JsonElement plan, string date) =>
        Sessions(plan).Single(s => s.GetProperty("date").GetString() == date && s.GetProperty("type").GetString() != "Strength");

    private sealed record Runner(HttpClient Client, string Subject, Guid PlanId, JsonElement Plan)
    {
        public Uri Preview => Url($"/api/v1/me/plans/{PlanId}/session-adjustment/preview");
        public Uri Apply => Url($"/api/v1/me/plans/{PlanId}/session-adjustment/apply");
        public async Task<JsonElement> CurrentPlanAsync() => (await Json(await Client.GetAsync(Url($"/api/v1/me/plans/{PlanId}")))).GetProperty("plan");
    }

    private static async Task<Runner> SignUpAsync(StartLineApiFactory factory, object plan)
    {
        var subject = Guid.NewGuid().ToString();
        var client = factory.CreateClient().As(subject, email: $"{subject[..8]}@example.test");
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan }));
        var id = saved.GetProperty("id").GetGuid();
        return new Runner(client, subject, id, (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan"));
    }

    private static object TenK => new { raceName = "Flexible 10K", distanceKm = 10, raceDate = "2026-12-20", goalTime = "00:52:00", runDays = new[] { "Tuesday", "Thursday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 30, planFrom = "2026-10-19", version = 2 };

    // The plan used for the staging QA: Cape Town Marathon in 4:00, starting Monday 23 November.
    private static object Marathon => new { raceName = "Cape Town Marathon", distanceKm = 42.195, raceDate = "2027-05-23", goalTime = "04:00:00", runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" }, longRunDay = "Sunday", experience = "Regular", planFrom = "2026-11-20", startOn = "2026-11-23", version = 3 };

    private static JsonElement NextSteady(JsonElement plan, string from) =>
        Sessions(plan).First(s => string.CompareOrdinal(s.GetProperty("date").GetString(), from) >= 0 && Steady.Contains(s.GetProperty("type").GetString()));

    // R21 / Q296-04: no chat, consent, model or MCP route answers, even with the retired settings switched on.
    [Fact]
    public async Task The_retired_ai_coach_has_no_routes_even_with_its_old_settings_on()
    {
        await using var factory = new RetiredAiSettingsApiFactory();
        factory.Time.SetUtcNow(MondayMorning);
        var runner = await SignUpAsync(factory, TenK);

        (await runner.Client.GetAsync(Url("/api/v1/me/ai/status"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await runner.Client.PutAsJsonAsync(Url("/api/v1/me/ai/consent"), new { consent = true })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await runner.Client.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/ai/ask"), new { question = "make Sunday 20 km" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await runner.Client.PostAsync(Url("/mcp"), JsonContent.Create(new { jsonrpc = "2.0", id = 1, method = "tools/list" }))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await runner.Client.GetAsync(Url("/.well-known/oauth-protected-resource/mcp"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        // The rules-only change still works: it never needed the AI settings.
        var target = NextSteady(runner.Plan, "2026-11-02");
        var preview = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, new { date = target.GetProperty("date").GetString(), kind = "Duration", minutes = 20 }));
        preview.GetProperty("outcome").GetString().ShouldBe("Proposed");
    }

    [Fact]
    public async Task Changes_need_a_signed_in_runner_and_work_with_the_ai_settings_off()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(MondayMorning);
        var id = Guid.NewGuid();
        (await factory.CreateClient().PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/session-adjustment/preview"), new { date = "2026-11-03", kind = "Distance", km = 5 }))
            .StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        var runner = await SignUpAsync(factory, TenK);
        var target = NextSteady(runner.Plan, "2026-11-02");
        (await runner.Client.PostAsJsonAsync(runner.Preview, new { date = target.GetProperty("date").GetString(), kind = "Duration", minutes = 20 })).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task An_exact_change_is_previewed_applied_only_as_seen_kept_its_type_and_undone_as_written()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(MondayMorning);
        var runner = await SignUpAsync(factory, TenK);
        var target = NextSteady(runner.Plan, "2026-11-02");
        var (date, type, km) = (target.GetProperty("date").GetString()!, target.GetProperty("type").GetString()!, target.GetProperty("distanceKm").GetDouble());
        var shorter = Math.Max(1, Math.Floor(km) - 1);
        var request = new { date, kind = "Distance", km = shorter };

        var preview = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, request));
        preview.GetProperty("outcome").GetString().ShouldBe("Proposed");
        preview.GetProperty("before").GetProperty("distanceKm").GetDouble().ShouldBe(km);
        preview.GetProperty("after").GetProperty("distanceKm").GetDouble().ShouldBe(shorter);
        preview.GetProperty("after").GetProperty("type").GetString().ShouldBe(type);
        var token = preview.GetProperty("token").GetString()!;
        token.Length.ShouldBe(64);

        // A preview changes nothing; a made-up token changes nothing.
        (await runner.CurrentPlanAsync()).GetRawText().ShouldBe(runner.Plan.GetRawText());
        (await runner.Client.PostAsJsonAsync(runner.Apply, new { request, token = new string('0', 64) })).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        await Json(await runner.Client.PostAsJsonAsync(runner.Apply, new { request, token }));
        var after = Run(await runner.CurrentPlanAsync(), date);
        after.GetProperty("distanceKm").GetDouble().ShouldBe(shorter);
        after.GetProperty("type").GetString().ShouldBe(type);

        // The same preview can't be applied twice: the plan moved on.
        (await runner.Client.PostAsJsonAsync(runner.Apply, new { request, token })).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        var restored = await Json(await runner.Client.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/adjustments/restore"), new { dates = new[] { date } }));
        restored.GetProperty("plan").GetRawText().ShouldBe(runner.Plan.GetRawText());

        // Another runner can't see or change this plan.
        var stranger = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await stranger.PostAsJsonAsync(runner.Preview, request)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await stranger.PostAsJsonAsync(runner.Apply, new { request, token })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_new_check_in_makes_an_old_preview_stale()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(MondayMorning);
        var runner = await SignUpAsync(factory, TenK);
        var target = NextSteady(runner.Plan, "2026-11-02");
        var request = new { date = target.GetProperty("date").GetString(), kind = "Duration", minutes = 20 };
        var preview = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, request));
        preview.GetProperty("outcome").GetString().ShouldBe("Proposed");

        await SeedAsync(factory, db => db.SessionCheckIns.Add(SessionCheckIn.Create(runner.PlanId, new DateOnly(2026, 11, 1), SessionType.Easy,
            new CheckInAnswers(CheckInStatus.Done, 4, PainLevel.Niggle, BodyArea.Calf))));

        (await runner.Client.PostAsJsonAsync(runner.Apply, new { request, token = preview.GetProperty("token").GetString() }))
            .StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Days_are_the_runners_own_near_midnight_too()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(MondayMorning);
        var runner = await SignUpAsync(factory, TenK);
        Run(runner.Plan, "2026-11-03").ValueKind.ShouldBe(JsonValueKind.Object);

        // 22:30 UTC on Tuesday 3 November is already Wednesday 4 November in Johannesburg: Tuesday's run is in the past.
        factory.Time.SetUtcNow(new DateTimeOffset(2026, 11, 3, 22, 30, 0, TimeSpan.Zero));
        (await runner.Client.PostAsJsonAsync(runner.Preview, new { date = "2026-11-03", kind = "Distance", km = 3 }))
            .StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    // PR #296 staging QA: "35 minutes on Tuesday" shortens the 7.5 km easy run to what fits at the slow end of easy pace.
    [Fact]
    public async Task Staging_qa_time_available_shortens_tuesdays_easy_run_and_undo_restores_the_week()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(QaSaturday);
        var runner = await SignUpAsync(factory, Marathon);
        var request = new { date = "2026-11-24", kind = "Duration", minutes = 35 };

        var preview = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, request));
        preview.GetProperty("outcome").GetString().ShouldBe("Proposed");
        var after = preview.GetProperty("after");
        after.GetProperty("type").GetString().ShouldBe("Easy");
        var slowest = after.GetProperty("slowestSecondsPerKm").GetInt32();
        var km = after.GetProperty("distanceKm").GetDouble();
        (km * slowest).ShouldBeLessThanOrEqualTo(35 * 60);
        ((km + 0.25) * slowest).ShouldBeGreaterThan(35 * 60);
        (preview.GetProperty("weekKmBefore").GetDouble() - preview.GetProperty("weekKmAfter").GetDouble())
            .ShouldBe(preview.GetProperty("before").GetProperty("distanceKm").GetDouble() - km, 0.001);

        await Json(await runner.Client.PostAsJsonAsync(runner.Apply, new { request, token = preview.GetProperty("token").GetString() }));
        Run(await runner.CurrentPlanAsync(), "2026-11-24").GetProperty("distanceKm").GetDouble().ShouldBe(km);
        var restored = await Json(await runner.Client.PostAsJsonAsync(Url($"/api/v1/me/plans/{runner.PlanId}/adjustments/restore"), new { dates = new[] { "2026-11-24" } }));
        restored.GetProperty("plan").GetRawText().ShouldBe(runner.Plan.GetRawText());
    }

    // PR #296 staging QA and Q296-02: 20 km is refused with a quarter-km safe limit, which is then proposed and saved exactly.
    [Fact]
    public async Task Staging_qa_a_too_long_long_run_is_refused_with_an_exact_safe_limit_that_saves_exactly()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(QaSaturday);
        var runner = await SignUpAsync(factory, Marathon);
        var longRun = Run(runner.Plan, "2026-11-29");
        longRun.GetProperty("type").GetString().ShouldBe("LongRun");

        var refused = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, new { date = "2026-11-29", kind = "Distance", km = 20 }));
        refused.GetProperty("outcome").GetString().ShouldBe("NotRecommended");
        refused.TryGetProperty("token", out var none).ShouldBeTrue();
        none.ValueKind.ShouldBe(JsonValueKind.Null);
        var limit = refused.GetProperty("safeLimitKm").GetDouble();
        (limit * 4).ShouldBe(Math.Round(limit * 4));
        limit.ShouldBeLessThanOrEqualTo(longRun.GetProperty("distanceKm").GetDouble() * 1.2);
        limit.ShouldBeGreaterThan(longRun.GetProperty("distanceKm").GetDouble());

        var request = new { date = "2026-11-29", kind = "Distance", km = limit };
        var proposed = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, request));
        proposed.GetProperty("outcome").GetString().ShouldBe("Proposed");
        proposed.GetProperty("after").GetProperty("distanceKm").GetDouble().ShouldBe(limit);
        proposed.GetProperty("after").GetProperty("type").GetString().ShouldBe("LongRun");

        await Json(await runner.Client.PostAsJsonAsync(runner.Apply, new { request, token = proposed.GetProperty("token").GetString() }));
        var saved = Run(await runner.CurrentPlanAsync(), "2026-11-29");
        saved.GetProperty("distanceKm").GetDouble().ShouldBe(limit);
        saved.GetProperty("type").GetString().ShouldBe("LongRun");
    }

    // PR #296 staging QA: a slower easy pace becomes a ±10 s band at the same distance; a faster one is refused.
    [Fact]
    public async Task Staging_qa_slower_easy_pace_is_a_band_and_faster_is_refused()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(QaSaturday);
        var runner = await SignUpAsync(factory, Marathon);
        var tuesday = Run(runner.Plan, "2026-11-24");

        var slower = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, new { date = "2026-11-24", kind = "Pace", paceSecondsPerKm = 460 }));
        slower.GetProperty("outcome").GetString().ShouldBe("Proposed");
        slower.GetProperty("after").GetProperty("fastestSecondsPerKm").GetInt32().ShouldBe(450);
        slower.GetProperty("after").GetProperty("slowestSecondsPerKm").GetInt32().ShouldBe(470);
        slower.GetProperty("after").GetProperty("distanceKm").GetDouble().ShouldBe(tuesday.GetProperty("distanceKm").GetDouble());

        var faster = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, new { date = "2026-11-24", kind = "Pace", paceSecondsPerKm = 330 }));
        faster.GetProperty("outcome").GetString().ShouldBe("NotRecommended");
    }

    // Q296-03: the runs a structured picker offers, for a plan that starts next week, are the real runs; tomorrow's rest day
    // (Sunday 22) is not one of them and can't be changed, while Sunday 29's long run can.
    [Fact]
    public async Task A_plan_starting_next_week_targets_its_real_sunday_long_run_never_tomorrows_rest_day()
    {
        await using var factory = new StartLineApiFactory();
        factory.Time.SetUtcNow(QaSaturday);
        var runner = await SignUpAsync(factory, Marathon);

        Sessions(runner.Plan).Any(s => s.GetProperty("date").GetString() == "2026-11-22").ShouldBeFalse();
        var sundays = Sessions(runner.Plan)
            .Where(s => s.GetProperty("date").GetString() is { } d && string.CompareOrdinal(d, "2026-11-21") >= 0 && string.CompareOrdinal(d, "2026-12-04") <= 0)
            .Where(s => DateOnly.Parse(s.GetProperty("date").GetString()!, System.Globalization.CultureInfo.InvariantCulture).DayOfWeek == DayOfWeek.Sunday)
            .ToList();
        sundays.Single().GetProperty("date").GetString().ShouldBe("2026-11-29");

        (await runner.Client.PostAsJsonAsync(runner.Preview, new { date = "2026-11-22", kind = "Distance", km = 10 })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var shorter = await Json(await runner.Client.PostAsJsonAsync(runner.Preview, new { date = "2026-11-29", kind = "Distance", km = 10 }));
        shorter.GetProperty("outcome").GetString().ShouldBe("Proposed");
        shorter.GetProperty("before").GetProperty("date").GetString().ShouldBe("2026-11-29");
        (await runner.CurrentPlanAsync()).GetRawText().ShouldBe(runner.Plan.GetRawText());
    }

    private static async Task SeedAsync(StartLineApiFactory factory, Action<StartLineDbContext> seed)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        seed(db);
        await db.SaveChangesAsync();
    }
}
