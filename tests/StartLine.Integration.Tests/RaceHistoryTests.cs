using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Journey;
using StartLine.Domain.Journey;
using StartLine.Domain.Plans;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

public sealed class RaceHistoryTests(JourneyFactory factory) : IClassFixture<JourneyFactory>
{
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        response.IsSuccessStatusCode.ShouldBeTrue(await response.Content.ReadAsStringAsync());
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }
    private static SaveRaceMemoryRequest London => new("London Marathon", 42.195, new(2026, 4, 26), RaceOutcome.Finished,
        TimeSpan.FromHours(4), 42.4, Note: "My first marathon", TimeKind: RaceTimeKind.OfficialChip);

    private async Task<(HttpClient Client, Guid RunnerId)> Runner()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        var runner = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Synthetic journey runner",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        }));
        return (client, runner.GetProperty("id").GetGuid());
    }

    private async Task<Guid> PastPlan(Guid runnerId, SavedPlanStatus status = SavedPlanStatus.Active)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var plan = SavedPlan.Create(runnerId, "London chapter", new(null, "London Marathon", 42.195, new(2026, 4, 26), TimeSpan.FromHours(4),
            [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 25, Experience.Regular, [], new(2026, 1, 5), GeneratorVersion: 2));
        if (status == SavedPlanStatus.Archived) plan.Archive();
        db.SavedPlans.Add(plan);
        await db.SaveChangesAsync();
        return plan.Id;
    }

    [Fact]
    public async Task A_race_without_a_plan_survives_reloads_exports_and_is_removed_with_the_account()
    {
        var (client, runnerId) = await Runner();
        using var owned = client;
        var id = Guid.NewGuid();
        var saved = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{id}"), London));
        saved.GetProperty("result").GetProperty("planId").ValueKind.ShouldBe(JsonValueKind.Null);
        saved.GetProperty("major").GetString().ShouldBe("London");
        saved.GetProperty("majorEligible").GetBoolean().ShouldBeTrue();
        saved.GetProperty("result").GetProperty("timeKind").GetString().ShouldBe("OfficialChip");
        var history = await Json(await client.GetAsync(Url("/api/v1/me/journey/races")));
        history.GetProperty("races").GetArrayLength().ShouldBe(1);
        history.GetProperty("majors").GetArrayLength().ShouldBe(8);
        (await Json(await client.GetAsync(Url("/api/v1/me/journey")))).GetProperty("chapters").GetArrayLength().ShouldBe(0);
        var export = await Json(await client.GetAsync(Url("/api/v1/me/export")));
        var memory = export.GetProperty("journey").GetProperty("raceResults")[0];
        memory.GetProperty("eventName").GetString().ShouldBe("London Marathon");
        memory.GetProperty("eventDistanceKm").GetDouble().ShouldBe(42.195);
        memory.GetProperty("note").GetString().ShouldBe("My first marathon");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.SavedPlans.CountAsync(p => p.RunnerId == runnerId)).ShouldBe(0);
        (await db.Achievements.CountAsync(a => a.RunnerId == runnerId)).ShouldBe(0);
        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await db.RaceResults.CountAsync(r => r.RunnerId == runnerId)).ShouldBe(0);
    }

    [Fact]
    public async Task Retries_are_idempotent_and_concurrent_event_duplicates_cannot_create_two_trophies()
    {
        var (client, runnerId) = await Runner();
        using var owned = client;
        var id = Guid.NewGuid();
        var saved = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{id}"), London));
        var retry = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{id}"), London));
        retry.GetProperty("result").GetProperty("version").GetString().ShouldBe(saved.GetProperty("result").GetProperty("version").GetString());
        var duplicate = await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{Guid.NewGuid()}"), London with { EventName = "TCS London Marathon" });
        duplicate.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var nextEdition = London with { RaceDate = new(2025, 4, 27) };
        var concurrent = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{Guid.NewGuid()}"), nextEdition)));
        concurrent.Count(r => r.IsSuccessStatusCode).ShouldBe(1);
        concurrent.Count(r => r.StatusCode == HttpStatusCode.Conflict).ShouldBe(1);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.RaceResults.CountAsync(r => r.RunnerId == runnerId)).ShouldBe(2);
        var races = (await Json(await client.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races");
        races.GetArrayLength().ShouldBe(2);
        races.EnumerateArray().All(r => r.GetProperty("majorEligible").GetBoolean()).ShouldBeTrue();
    }

    [Fact]
    public async Task Corrections_withdraw_trophies_and_stale_edits_or_removals_preserve_the_newer_result()
    {
        var (client, _) = await Runner();
        using var owned = client;
        var id = Guid.NewGuid();
        var path = Url($"/api/v1/me/journey/races/{id}");
        var first = await Json(await client.PutAsJsonAsync(path, London));
        var firstVersion = first.GetProperty("result").GetProperty("version").GetString()!;
        var change = London with { Outcome = RaceOutcome.DidNotFinish, FinishTime = null, DistanceKm = 30, ExpectedVersion = firstVersion };
        var updated = await Json(await client.PutAsJsonAsync(path, change));
        updated.GetProperty("majorEligible").GetBoolean().ShouldBeFalse();
        updated.GetProperty("result").GetProperty("timeKind").GetString().ShouldBe("Unspecified");
        (await client.PutAsJsonAsync(path, London with { ExpectedVersion = firstVersion })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.PutAsJsonAsync(path, London)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.DeleteAsync(Url($"{path}?expectedVersion={Uri.EscapeDataString(firstVersion)}"))).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var races = (await Json(await client.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races");
        races[0].GetProperty("result").GetProperty("outcome").GetString().ShouldBe("DidNotFinish");
        var version = updated.GetProperty("result").GetProperty("version").GetString()!;
        (await client.DeleteAsync(Url($"{path}?expectedVersion={Uri.EscapeDataString(version)}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Json(await client.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races").GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task Ownership_future_dates_and_half_marathon_major_claims_are_enforced()
    {
        var (client, _) = await Runner();
        using var owned = client;
        var (other, _) = await Runner();
        using var outsider = other;
        var id = Guid.NewGuid();
        var saved = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{id}"), London));
        (await Json(await other.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races").GetArrayLength().ShouldBe(0);
        var version = saved.GetProperty("result").GetProperty("version").GetString()!;
        (await other.DeleteAsync(Url($"/api/v1/me/journey/races/{id}?expectedVersion={Uri.EscapeDataString(version)}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await other.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{id}"), London with { ExpectedVersion = version })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{Guid.NewGuid()}"), London with { RaceDate = new(2026, 12, 1) })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{Guid.NewGuid()}"), London with { EventDistanceKm = 21.1, Major = MarathonMajor.London })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{Guid.NewGuid()}"), London with { ActivityId = Guid.NewGuid() })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Existing_plan_results_join_the_history_and_archive_without_losing_the_result_or_recovery()
    {
        var (client, runnerId) = await Runner();
        using var owned = client;
        var planId = await PastPlan(runnerId);
        var result = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/plans/{planId}/race-result"), new
        { outcome = "Finished", finishTime = "04:00:00", distanceKm = 42.4, timeKind = "RecordedElapsed" }));
        var recovery = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/journey/recovery"), new
        { planId, eventName = "London Marathon", distanceKm = 42.195, raceDate = "2026-04-26", effort = "Hard", preference = "Rest" }));
        var chapter = await Json(await client.GetAsync(Url($"/api/v1/me/journey/plans/{planId}")));
        var archive = new { expectedVersion = chapter.GetProperty("version").GetString() };
        (await client.PostAsJsonAsync(Url($"/api/v1/me/journey/plans/{planId}/archive"), new { expectedVersion = "AAAA" })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await client.PostAsJsonAsync(Url($"/api/v1/me/journey/plans/{planId}/archive"), archive)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.PostAsJsonAsync(Url($"/api/v1/me/journey/plans/{planId}/archive"), archive)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var journey = await Json(await client.GetAsync(Url("/api/v1/me/journey")));
        journey.GetProperty("chapters")[0].GetProperty("status").GetString().ShouldBe("Archived");
        journey.GetProperty("chapters")[0].GetProperty("raceResult").GetProperty("id").GetGuid().ShouldBe(result.GetProperty("id").GetGuid());
        journey.GetProperty("recovery").GetProperty("id").GetGuid().ShouldBe(recovery.GetProperty("id").GetGuid());
        var races = (await Json(await client.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races");
        races.GetArrayLength().ShouldBe(1);
        races[0].GetProperty("majorEligible").GetBoolean().ShouldBeTrue();
        races[0].GetProperty("result").GetProperty("timeKind").GetString().ShouldBe("RecordedElapsed");
        (await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{Guid.NewGuid()}"), London)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var otherChapter = await PastPlan(runnerId, SavedPlanStatus.Archived);
        (await client.PutAsJsonAsync(Url($"/api/v1/me/journey/plans/{otherChapter}/race-result"), new
        { outcome = "Finished", finishTime = "04:00:00" })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        // Correcting the same shared result from the race ledger updates its original chapter and withdraws the badge.
        await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{result.GetProperty("id").GetGuid()}"), London with
        { Outcome = RaceOutcome.DidNotFinish, FinishTime = null, DistanceKm = 30, ExpectedVersion = result.GetProperty("version").GetString() }));
        var corrected = await Json(await client.GetAsync(Url($"/api/v1/me/journey/plans/{planId}")));
        corrected.GetProperty("raceResult").GetProperty("outcome").GetString().ShouldBe("DidNotFinish");
        corrected.GetProperty("achievements").EnumerateArray().Any(a => a.GetProperty("kind").GetString() == "RaceFinished").ShouldBeFalse();
    }

    [Fact]
    public async Task Legacy_duplicates_require_review_before_trophies_and_resolve_without_losing_training_chapters()
    {
        var (client, runnerId) = await Runner();
        using var owned = client;
        var firstPlan = await PastPlan(runnerId, SavedPlanStatus.Archived);
        var secondPlan = await PastPlan(runnerId, SavedPlanStatus.Archived);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            db.RaceResults.Add(RaceResult.Record(runnerId, firstPlan, new(RaceOutcome.Finished, London.RaceDate, London.FinishTime), new(2026, 1, 5), new(2026, 10, 8)));
            db.RaceResults.Add(RaceResult.Record(runnerId, secondPlan, new(RaceOutcome.DidNotFinish, London.RaceDate, DistanceKm: 30), new(2026, 1, 5), new(2026, 10, 8)));
            await db.SaveChangesAsync();
        }
        var races = (await Json(await client.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races");
        races.GetArrayLength().ShouldBe(2);
        races.EnumerateArray().All(r => r.GetProperty("needsReview").GetBoolean()).ShouldBeTrue();
        races.EnumerateArray().Any(r => r.GetProperty("majorEligible").GetBoolean()).ShouldBeFalse();
        var incorrect = races.EnumerateArray().Single(r => r.GetProperty("result").GetProperty("outcome").GetString() == "DidNotFinish").GetProperty("result");
        (await client.DeleteAsync(Url($"/api/v1/me/journey/races/{incorrect.GetProperty("id").GetGuid()}?expectedVersion={Uri.EscapeDataString(incorrect.GetProperty("version").GetString()!)}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var resolved = (await Json(await client.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races");
        resolved.GetArrayLength().ShouldBe(1);
        resolved[0].GetProperty("needsReview").GetBoolean().ShouldBeFalse();
        resolved[0].GetProperty("majorEligible").GetBoolean().ShouldBeTrue();
        (await Json(await client.GetAsync(Url("/api/v1/me/journey")))).GetProperty("chapters").GetArrayLength().ShouldBe(2);
        await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{resolved[0].GetProperty("result").GetProperty("id").GetGuid()}"), London with
        { ExpectedVersion = resolved[0].GetProperty("result").GetProperty("version").GetString() }));
    }

    [Fact]
    public async Task Lifetime_history_is_paged_without_a_fifty_plan_retention_limit()
    {
        var (client, runnerId) = await Runner();
        using var owned = client;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            for (var index = 0; index < 55; index++)
            {
                var plan = SavedPlan.Create(runnerId, $"Past chapter {index}", new(null, $"Past 10K {index}", 10, new(2026, 10, 4), TimeSpan.FromMinutes(55),
                    [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 20, Experience.Regular, [], new(2026, 8, 10), GeneratorVersion: 2));
                plan.Archive(); db.SavedPlans.Add(plan);
            }
            await db.SaveChangesAsync();
        }
        var first = await Json(await client.GetAsync(Url("/api/v1/me/journey")));
        var second = await Json(await client.GetAsync(Url("/api/v1/me/journey?page=1")));
        var third = await Json(await client.GetAsync(Url("/api/v1/me/journey?page=2")));
        first.GetProperty("chapters").GetArrayLength().ShouldBe(20);
        first.GetProperty("hasMoreChapters").GetBoolean().ShouldBeTrue();
        second.GetProperty("chapters").GetArrayLength().ShouldBe(20);
        third.GetProperty("chapters").GetArrayLength().ShouldBe(15);
        third.GetProperty("hasMoreChapters").GetBoolean().ShouldBeFalse();
        new[] { first, second, third }.SelectMany(p => p.GetProperty("chapters").EnumerateArray()).Select(c => c.GetProperty("planId").GetGuid()).Distinct().Count().ShouldBe(55);
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            plan = new
            { raceName = "My next 10K", distanceKm = 10, raceDate = "2026-12-06", goalTime = "00:55:00", runDays = new[] { "Tuesday", "Thursday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 20 }
        }));
        (await Json(await client.GetAsync(Url("/api/v1/me/plans")))).GetArrayLength().ShouldBe(56);
        (await client.GetAsync(Url("/api/v1/me/journey?page=-1"))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task A_legacy_result_keeps_metadata_without_inventing_chip_timing_and_can_retain_an_expired_recording_link()
    {
        var (client, runnerId) = await Runner();
        using var owned = client;
        var planId = await PastPlan(runnerId, SavedPlanStatus.Archived);
        var expiredActivity = Guid.NewGuid();
        Guid resultId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            var result = RaceResult.Record(runnerId, planId, new(RaceOutcome.Finished, London.RaceDate, London.FinishTime, London.DistanceKm, expiredActivity), new(2026, 1, 5), new(2026, 10, 8));
            resultId = result.Id; db.RaceResults.Add(result); await db.SaveChangesAsync();
            var migration = new StartLine.Infrastructure.Persistence.Migrations.IndependentRaceHistory();
            foreach (var sql in migration.UpOperations.OfType<SqlOperation>()) await db.Database.ExecuteSqlRawAsync(sql.Sql);
            db.ChangeTracker.Clear();
            var retained = await db.RaceResults.SingleAsync(r => r.Id == resultId);
            retained.EventName.ShouldBe("London Marathon");
            retained.EventDistanceKm.ShouldBe(42.195);
            retained.TimeKind.ShouldBe(RaceTimeKind.Unspecified);
        }
        var memory = (await Json(await client.GetAsync(Url("/api/v1/me/journey/races")))).GetProperty("races")[0];
        memory.GetProperty("major").GetString().ShouldBe("London");
        var changed = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/races/{resultId}"), London with
        { ActivityId = expiredActivity, ExpectedVersion = memory.GetProperty("result").GetProperty("version").GetString() }));
        changed.GetProperty("result").GetProperty("activityId").GetGuid().ShouldBe(expiredActivity);
        changed.GetProperty("result").GetProperty("timeKind").GetString().ShouldBe("OfficialChip");
    }
}
