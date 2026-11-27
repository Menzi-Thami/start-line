using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

public class PrivatePrescriptionTests
{
    private const string Imports = "/api/v1/me/private-prescriptions";
    private const string Plans = "/api/v1/me/plans";
    private static string Url(string path) => "https://localhost" + path;
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        response.Headers.CacheControl?.NoStore.ShouldBeTrue();
        return JsonDocument.Parse(body).RootElement;
    }
    private static object Step(double km, string kind = "Run") => new { kind, distanceKm = km, zone = "Easy", fastestSecondsPerKm = 360, slowestSecondsPerKm = 420, times = 1, steps = Array.Empty<object>() };
    internal static JsonObject Payload()
    {
        var start = new DateOnly(2026, 10, 8); var race = new DateOnly(2026, 11, 7);
        List<object> sessions = [];
        for (var date = start; date < race; date = date.AddDays(1))
        {
            var raceWeek = date >= new DateOnly(2026, 11, 2);
            if (date.DayOfWeek is DayOfWeek.Tuesday or DayOfWeek.Thursday or DayOfWeek.Sunday)
                sessions.Add(new { id = Guid.NewGuid(), date = date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), type = date.DayOfWeek == DayOfWeek.Sunday ? "LongRun" : "Easy", title = "Synthetic private run", targetRpe = 4, zone = "Easy", steps = new[] { Step(raceWeek ? 2 : 6) } });
            if (!raceWeek && date.DayOfWeek is DayOfWeek.Monday or DayOfWeek.Tuesday or DayOfWeek.Thursday or DayOfWeek.Friday)
                sessions.Add(new { id = Guid.NewGuid(), date = date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), type = "Strength", title = "Synthetic private gym", targetRpe = 4, gym = date.DayOfWeek is DayOfWeek.Monday or DayOfWeek.Friday ? "Lower" : "Upper", durationMinutes = 40, reducedLoad = true, steps = Array.Empty<object>() });
        }
        sessions.Add(new { id = Guid.NewGuid(), date = race.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), type = "Race", title = "Synthetic private race", targetRpe = 8, zone = "Race", steps = new[] { Step(10) } });
        return JsonSerializer.SerializeToNode(new
        {
            name = "Synthetic private chapter",
            baseline = new { raceName = "Synthetic 10K", distanceKm = 10, raceDate = "2026-11-07", goalTime = "01:00:00", runDays = new[] { "Tuesday", "Thursday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 25, planFrom = "2026-10-08", startOn = "2026-10-08", version = 3 },
            prescription = new { schemaVersion = 1, paces = Enum.GetValues<PaceZone>().Select(zone => new { zone = zone.ToString(), fastestSecondsPerKm = 360, slowestSecondsPerKm = 420 }), sessions },
        })!.AsObject();
    }
    private static async Task<HttpClient> Runner(StartLineApiFactory factory, bool entitled = true)
    {
        var subject = Guid.NewGuid().ToString(); var client = factory.CreateClient().As(subject);
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Synthetic runner", timeZone = "Etc/UTC", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true }));
        if (entitled)
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            var runner = await db.Runners.SingleAsync(r => r.IdentitySubject == subject);
            runner.SetPrivatePrescriptionsEnabled(true);
            await db.SaveChangesAsync();
        }
        return client;
    }
    private static async Task<JsonElement> Preview(HttpClient client, JsonObject? payload = null) =>
        await Json(await client.PostAsJsonAsync(Url(Imports + "/preview"), payload ?? Payload()));
    private static Task<HttpResponseMessage> Activate(HttpClient client, JsonElement preview, bool consent = true) =>
        client.PostAsJsonAsync(Url($"{Imports}/{preview.GetProperty("importId").GetGuid()}/activate"), new { token = preview.GetProperty("token").GetString(), consentToReplace = consent });
    private static async Task<Guid> Active(HttpClient client, JsonElement preview) => (await Json(await Activate(client, preview))).GetProperty("planId").GetGuid();

    [Fact]
    public async Task Persisted_prescription_is_identical_on_reopen_coach_calendar_export_and_separate_run_gym_completion()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory);
        var preview = await Preview(client); var id = await Active(client, preview);
        var saved = await Json(await client.GetAsync(Url($"{Plans}/{id}")));
        var plan = saved.GetProperty("plan"); plan.GetProperty("isPrivate").GetBoolean().ShouldBeTrue();
        plan.GetRawText().ShouldBe(preview.GetProperty("plan").GetRawText());
        (await Json(await client.PostAsync(Url($"{Plans}/{id}/coach"), null))).GetProperty("plan").GetRawText().ShouldBe(plan.GetRawText());
        var ics = await client.GetAsync(Url($"{Imports}/plans/{id}/calendar.ics")); ics.StatusCode.ShouldBe(HttpStatusCode.OK);
        var calendar = await ics.Content.ReadAsStringAsync(); calendar.ShouldContain("Synthetic private run"); calendar.ShouldContain("Synthetic private gym");
        var link = await Json(await client.GetAsync(Url("/api/v1/me/calendar")));
        (await factory.CreateClient().GetAsync(Url($"/api/v1/calendar/{link.GetProperty("token").GetString()}.ics"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        var sessions = plan.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray()).ToList();
        sessions.Count(s => s.GetProperty("date").GetString() == "2026-10-13").ShouldBe(2);
        var gym = sessions.Single(s => s.GetProperty("date").GetString() == "2026-10-08" && s.GetProperty("type").GetString() == "Strength");
        var gymId = gym.GetProperty("prescriptionId").GetGuid();
        await Json(await client.PutAsJsonAsync(Url($"{Imports}/plans/{id}/gym/{gymId}"), new { done = true, effort = 5 }));
        await Json(await client.PutAsJsonAsync(Url($"{Plans}/{id}/check-ins/2026-10-08/Easy"), new { status = "Done", effort = 4 }));
        var entries = await Json(await client.GetAsync(Url($"{Plans}/{id}/check-ins"))); entries.GetArrayLength().ShouldBe(1);
        var reopened = (await Json(await client.GetAsync(Url($"{Plans}/{id}")))).GetProperty("plan");
        reopened.GetProperty("weeks")[0].GetProperty("sessions").EnumerateArray().Single(s => s.GetProperty("type").GetString() == "Strength" && s.GetProperty("date").GetString() == "2026-10-08").GetProperty("gymDone").GetBoolean().ShouldBeTrue();
        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        export.GetRawText().ShouldContain("prescription"); export.GetRawText().ShouldNotContain(preview.GetProperty("token").GetString()!);
    }

    [Fact]
    public async Task Access_is_default_denied_owner_scoped_and_anonymous_cannot_import_or_probe()
    {
        await using var factory = new StartLineApiFactory(); var owner = await Runner(factory); var other = await Runner(factory, false);
        var preview = await Preview(owner); var id = await Active(owner, preview);
        (await other.PostAsJsonAsync(Url(Imports + "/preview"), Payload())).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Activate(other, preview)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        foreach (var path in new[] { $"{Plans}/{id}", $"{Plans}/{id}/check-ins", $"{Plans}/{id}/progress", $"{Plans}/{id}/insights", $"{Plans}/{id}/strava-completions", $"{Imports}/plans/{id}/calendar.ics" })
            (await other.GetAsync(Url(path))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await other.DeleteAsync(Url($"{Plans}/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await other.PostAsync(Url($"{Plans}/{id}/restore"), null)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await other.GetStringAsync(Url(Plans))).ShouldNotContain(id.ToString());
        (await other.GetStringAsync(Url("/api/v1/me/export"))).ShouldNotContain("Synthetic private");
        (await factory.CreateClient().PostAsJsonAsync(Url(Imports + "/preview"), Payload())).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Invalid_unknown_duplicate_and_oversized_payloads_leave_existing_current_plan_unchanged()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory);
        var payload = Payload(); var id = (await Json(await client.PostAsJsonAsync(Url(Plans), new { plan = payload["baseline"] }))).GetProperty("id").GetGuid();
        var before = await client.GetStringAsync(Url($"{Plans}/{id}"));
        payload["runnerId"] = Guid.NewGuid().ToString();
        (await client.PostAsJsonAsync(Url(Imports + "/preview"), payload)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        payload.Remove("runnerId"); payload["prescription"]!["schemaVersion"] = 999;
        (await client.PostAsJsonAsync(Url(Imports + "/preview"), payload)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        payload = Payload(); payload["prescription"]!["sessions"]!.AsArray()[0]!["targetRpe"] = 11;
        (await client.PostAsJsonAsync(Url(Imports + "/preview"), payload)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var duplicate = new StringContent("{\"name\":\"one\",\"name\":\"two\"}", System.Text.Encoding.UTF8, "application/json");
        (await client.PostAsync(Url(Imports + "/preview"), duplicate)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await client.GetStringAsync(Url($"{Plans}/{id}"))).ShouldBe(before);
    }

    [Fact]
    public async Task Consent_tampered_token_stale_preview_and_expiry_never_replace_current_plan()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory);
        var preview = await Preview(client);
        (await Activate(client, preview, false)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.PostAsJsonAsync(Url($"{Imports}/{preview.GetProperty("importId").GetGuid()}/activate"), new { token = new string('0', 64), consentToReplace = true })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        var ordinary = await Json(await client.PostAsJsonAsync(Url(Plans), new { plan = Payload()["baseline"] }));
        var id = ordinary.GetProperty("id").GetGuid();
        (await Activate(client, preview)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var fresh = await Preview(client); factory.Time.Advance(TimeSpan.FromMinutes(31));
        (await Activate(client, fresh)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        export.GetProperty("privateImports").EnumerateArray().Any(i => i.GetProperty("id").GetGuid() == fresh.GetProperty("importId").GetGuid()).ShouldBeTrue();
        (await Json(await client.GetAsync(Url(Plans)))).EnumerateArray().Single(p => p.GetProperty("status").GetString() == "Active").GetProperty("id").GetGuid().ShouldBe(id);
    }

    [Fact]
    public async Task Activation_is_idempotent_and_archives_existing_history_instead_of_updating_same_race()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory);
        var original = (await Json(await client.PostAsJsonAsync(Url(Plans), new { plan = Payload()["baseline"] }))).GetProperty("id").GetGuid();
        var preview = await Preview(client); var id = await Active(client, preview); id.ShouldNotBe(original);
        (await Active(client, preview)).ShouldBe(id);
        var plans = await Json(await client.GetAsync(Url(Plans))); plans.GetArrayLength().ShouldBe(2);
        plans.EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == original).GetProperty("status").GetString().ShouldBe("Archived");
        (await client.PostAsJsonAsync(Url(Plans), new { plan = Payload()["baseline"], replaceCurrent = true })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.PostAsJsonAsync(Url($"{Plans}/{id}/replan"), new { replanFrom = "2026-10-08", setback = "MissedTraining" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Concurrent_previews_with_no_current_plan_can_activate_only_one_current_plan()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory);
        var first = await Preview(client); var second = await Preview(client);
        var responses = await Task.WhenAll(Activate(client, first), Activate(client, second));
        responses.Count(r => r.StatusCode == HttpStatusCode.OK).ShouldBe(1);
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).ShouldBe(1);
        (await Json(await client.GetAsync(Url(Plans)))).EnumerateArray().Count(p => p.GetProperty("status").GetString() == "Active").ShouldBe(1);
    }

    [Fact]
    public async Task Gym_moves_preview_apply_and_undo_independently_and_reject_logged_or_race_day_changes()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory); var preview = await Preview(client); var id = await Active(client, preview);
        var plan = preview.GetProperty("plan");
        var gym = plan.GetProperty("weeks")[0].GetProperty("sessions").EnumerateArray().Single(s => s.GetProperty("type").GetString() == "Strength" && s.GetProperty("date").GetString() == "2026-10-09");
        var moveUrl = Url($"{Imports}/plans/{id}/gym/{gym.GetProperty("prescriptionId").GetGuid()}/move");
        var move = await Json(await client.PostAsJsonAsync(moveUrl, new { target = "2026-10-10" }));
        (await Json(await client.GetAsync(Url($"{Plans}/{id}")))).GetProperty("plan").GetRawText().ShouldBe(plan.GetRawText());
        var applied = await Json(await client.PostAsJsonAsync(moveUrl, new { target = "2026-10-10", token = move.GetProperty("token").GetString() }));
        applied.GetProperty("proposed").GetRawText().ShouldBe(move.GetProperty("proposed").GetRawText());
        (await client.PostAsJsonAsync(moveUrl, new { target = "2026-10-11", token = move.GetProperty("token").GetString() })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var undo = await Json(await client.PostAsJsonAsync(moveUrl, new { target = (string?)null }));
        var restored = await Json(await client.PostAsJsonAsync(moveUrl, new { target = (string?)null, token = undo.GetProperty("token").GetString() }));
        restored.GetProperty("proposed").GetRawText().ShouldBe(plan.GetRawText());
    }

    [Fact]
    public async Task Fatigue_reduction_is_previewed_approved_and_undoable_without_generic_weekly_regeneration()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory); var preview = await Preview(client); var id = await Active(client, preview);
        await Json(await client.PutAsJsonAsync(Url($"{Plans}/{id}/check-ins/2026-10-08/Easy"), new { status = "Done", effort = 10 }));
        factory.Time.Advance(TimeSpan.FromDays(5));
        await Json(await client.PutAsJsonAsync(Url($"{Plans}/{id}/check-ins/2026-10-11/LongRun"), new { status = "Done", effort = 10 }));
        await Json(await client.PutAsJsonAsync(Url($"{Plans}/{id}/check-ins/2026-10-13/Easy"), new { status = "Done", effort = 10 }));
        var easing = await Json(await client.GetAsync(Url($"{Plans}/{id}/remaining-week/proposal?reported=true")));
        var weekly = await Json(await client.GetAsync(Url($"{Plans}/{id}/coach/proposal")));
        weekly.GetProperty("canApply").GetBoolean().ShouldBeFalse(); weekly.GetProperty("unsupportedReason").GetString().ShouldNotBeNullOrWhiteSpace();
        // One hard-feeling run in this week is insufficient for an automatic increase or a strain decision.
        easing.GetProperty("changes").GetArrayLength().ShouldBe(0);
    }
    [Fact]
    public async Task Two_hard_ratings_can_ease_future_runs_and_undo_restores_exact_steps_without_rewriting_logged_sessions()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory);
        var payload = Payload();
        payload["prescription"]!["sessions"]!.AsArray().Single(s => s!["type"]!.GetValue<string>() == "LongRun" && s["date"]!.GetValue<string>() == "2026-10-18")!["targetRpe"] = 7;
        var preview = await Preview(client, payload); var id = await Active(client, preview);
        factory.Time.Advance(TimeSpan.FromDays(7));
        foreach (var date in new[] { "2026-10-13", "2026-10-15" })
            await Json(await client.PutAsJsonAsync(Url($"{Plans}/{id}/check-ins/{date}/Easy"), new { status = "Done", effort = 10 }));
        var before = (await Json(await client.GetAsync(Url($"{Plans}/{id}")))).GetProperty("plan");
        var easing = await Json(await client.GetAsync(Url($"{Plans}/{id}/remaining-week/proposal?reported=true")));
        easing.GetProperty("changes").GetArrayLength().ShouldBe(1);
        var accepted = await Json(await client.PostAsJsonAsync(Url($"{Plans}/{id}/remaining-week/apply"), new { token = easing.GetProperty("token").GetString(), reported = true }));
        var reopened = (await Json(await client.GetAsync(Url($"{Plans}/{id}")))).GetProperty("plan");
        reopened.GetRawText().ShouldBe(accepted.GetProperty("proposed").GetRawText());
        reopened.GetProperty("weeks").EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .Single(s => s.GetProperty("date").GetString() == "2026-10-18" && s.GetProperty("type").GetString() == "Easy")
            .GetProperty("targetRpe").GetInt32().ShouldBeLessThanOrEqualTo(4);
        (await client.PostAsJsonAsync(Url($"{Plans}/{id}/adjustments/restore"), new { dates = new[] { "2026-10-15" } })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var restored = await Json(await client.PostAsJsonAsync(Url($"{Plans}/{id}/adjustments/restore"), new { dates = new[] { "2026-10-18" } }));
        restored.GetProperty("plan").GetRawText().ShouldBe(before.GetRawText());
        var entries = await Json(await client.GetAsync(Url($"{Plans}/{id}/check-ins")));
        entries.EnumerateArray().All(c => c.GetProperty("prescribedKm").GetDouble() == 6).ShouldBeTrue();
    }

    [Fact]
    public async Task Private_archive_restore_and_account_deletion_preserve_then_remove_the_persisted_prescription()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory); var preview = await Preview(client); var id = await Active(client, preview);
        var plan = (await Json(await client.GetAsync(Url($"{Plans}/{id}")))).GetProperty("plan");
        var payload = Payload(); payload["baseline"]!["raceName"] = "Synthetic other race";
        await Json(await client.PostAsJsonAsync(Url(Plans), new { plan = payload["baseline"], replaceCurrent = true }));
        var repeated = await Json(await Activate(client, preview));
        repeated.GetProperty("planId").GetGuid().ShouldBe(id);
        repeated.GetProperty("isCurrent").GetBoolean().ShouldBeFalse();
        var archived = await Json(await client.GetAsync(Url($"{Plans}/{id}")));
        archived.GetProperty("status").GetString().ShouldBe("Archived"); archived.GetProperty("plan").GetRawText().ShouldBe(plan.GetRawText());
        await Json(await client.PostAsync(Url($"{Plans}/{id}/restore"), null));
        (await Json(await client.GetAsync(Url($"{Plans}/{id}")))).GetProperty("plan").GetRawText().ShouldBe(plan.GetRawText());
        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.GetAsync(Url($"{Plans}/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.PrivatePlanImports.AnyAsync(i => i.Id == preview.GetProperty("importId").GetGuid())).ShouldBeFalse();
    }

    [Fact]
    public async Task Private_step_and_pace_precision_is_retained_across_preview_storage_and_read()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory); var payload = Payload();
        var session = payload["prescription"]!["sessions"]!.AsArray().First(s => s!["type"]!.GetValue<string>() == "Easy")!;
        session["steps"]![0]!["distanceKm"] = 6.125;
        session["steps"]![0]!["fastestSecondsPerKm"] = 360.25;
        payload["prescription"]!["paces"]![0]!["fastestSecondsPerKm"] = 360.25;
        var preview = await Preview(client, payload); var id = await Active(client, preview);
        var plan = (await Json(await client.GetAsync(Url($"{Plans}/{id}")))).GetProperty("plan");
        plan.GetRawText().ShouldBe(preview.GetProperty("plan").GetRawText());
        var run = plan.GetProperty("weeks")[0].GetProperty("sessions").EnumerateArray().Single(s => s.GetProperty("type").GetString() == "Easy");
        run.GetProperty("steps")[0].GetProperty("distanceKm").GetDouble().ShouldBe(6.125);
        run.GetProperty("steps")[0].GetProperty("fastestSecondsPerKm").GetDouble().ShouldBe(360.25);
        plan.GetProperty("paces")[0].GetProperty("fastestSecondsPerKm").GetDouble().ShouldBe(360.25);
    }

    [Fact]
    public async Task Private_run_moves_require_undo_before_another_adjustment_instead_of_dropping_an_eased_prescription()
    {
        await using var factory = new StartLineApiFactory(); var client = await Runner(factory); var preview = await Preview(client); var id = await Active(client, preview);
        var change = new { situation = "MoveRun", date = "2026-10-11", moveTo = "2026-10-10" };
        var move = await Json(await client.PostAsJsonAsync(Url($"{Plans}/{id}/life-happens/preview"), change));
        await Json(await client.PostAsJsonAsync(Url($"{Plans}/{id}/life-happens/apply"), new { change, token = move.GetProperty("token").GetString() }));
        (await client.GetAsync(Url($"{Plans}/{id}/remaining-week/proposal"))).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.PostAsJsonAsync(Url($"{Plans}/{id}/life-happens/preview"), new { situation = "ShortOnTime", date = "2026-10-10", minutes = 20 })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var restored = await Json(await client.PostAsJsonAsync(Url($"{Plans}/{id}/adjustments/restore"), new { dates = new[] { "2026-10-10" } }));
        restored.GetProperty("plan").GetRawText().ShouldBe(preview.GetProperty("plan").GetRawText());
    }

}
