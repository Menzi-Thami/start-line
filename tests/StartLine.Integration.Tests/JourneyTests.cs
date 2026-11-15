using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>
/// The running journey through the API against SQL: race results and badges, recovery and easy running, ownership,
/// idempotency, concurrency, and the plan and account flows that must keep journey data. Plans whose race has passed
/// are written straight to the test database (the API only builds plans for races to come); everything else goes
/// through the API. The clock stays at <see cref="StartLineApiFactory.Now"/> (Thursday 8 October 2026).
/// </summary>
public sealed class JourneyTests(JourneyFactory factory) : IClassFixture<JourneyFactory>
{
    // A Sunday before "today", and a plan of eight weeks before it.
    private static readonly DateOnly PastRace = new(2026, 10, 4);
    private static readonly DateOnly PastPlanFrom = new(2026, 8, 10);

    private static readonly object Profile = new
    {
        displayName = "Naledi",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        return JsonDocument.Parse(body).RootElement;
    }

    private static async Task<string?> Code(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;

    private async Task<(HttpClient Client, Guid RunnerId)> Runner()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        var me = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), Profile));
        return (client, me.GetProperty("id").GetGuid());
    }

    /// <summary>A plan for a 10K that was run last Sunday, written straight to the test database.</summary>
    private async Task<Guid> PastPlan(Guid runnerId, SavedPlanStatus status = SavedPlanStatus.Active)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        if (status == SavedPlanStatus.Active)
        {
            foreach (var current in await db.SavedPlans.Where(p => p.RunnerId == runnerId && p.Status == SavedPlanStatus.Active).ToListAsync())
            {
                current.Archive();
            }

            await db.SaveChangesAsync();
        }

        var plan = SavedPlan.Create(runnerId, "Spring 10K", new SavedPlanInputs(
            null, "Spring 10K", 10, PastRace, TimeSpan.FromMinutes(52), [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
            DayOfWeek.Sunday, 25, Experience.Regular, [], PastPlanFrom, GeneratorVersion: 2));
        if (status == SavedPlanStatus.Archived)
        {
            plan.Archive();
        }

        db.SavedPlans.Add(plan);
        await db.SaveChangesAsync();
        return plan.Id;
    }

    /// <summary>Every training run of the plan (not strength, not the race), as the runner sees it.</summary>
    private static async Task<List<(DateOnly Date, SessionType Type)>> TrainingRuns(HttpClient client, Guid planId)
    {
        var plan = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{planId}")));
        return [.. plan.GetProperty("plan").GetProperty("weeks").EnumerateArray()
            .SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .Select(s => (DateOnly.Parse(s.GetProperty("date").GetString()!, System.Globalization.CultureInfo.InvariantCulture), Enum.Parse<SessionType>(s.GetProperty("type").GetString()!)))
            .Where(s => s.Item2 is not (SessionType.Race or SessionType.Strength))];
    }

    /// <summary>Ticks every training run as done, straight into the test database (the API refuses check-ins on a past plan).</summary>
    private async Task TickAll(HttpClient client, Guid planId)
    {
        var runs = await TrainingRuns(client, planId);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        db.SessionCheckIns.AddRange(runs.Select(r => SessionCheckIn.Create(planId, r.Date, r.Type, new CheckInAnswers(CheckInStatus.Done, null))));
        await db.SaveChangesAsync();
    }

    private async Task Untick(Guid planId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var last = await db.SessionCheckIns.Where(c => c.SavedPlanId == planId).OrderByDescending(c => c.Date).FirstAsync();
        db.SessionCheckIns.Remove(last);
        await db.SaveChangesAsync();
    }

    private static async Task<JsonElement> Chapter(HttpClient client, Guid planId) =>
        (await Json(await client.GetAsync(Url("/api/v1/me/journey")))).GetProperty("chapters").EnumerateArray().Single(c => c.GetProperty("planId").GetGuid() == planId);

    private static string[] Kinds(JsonElement chapter) =>
        [.. chapter.GetProperty("achievements").EnumerateArray().Select(a => a.GetProperty("kind").GetString()!)];

    private static Task<HttpResponseMessage> PutResult(HttpClient client, Guid planId, object body) =>
        client.PutAsJsonAsync(Url($"/api/v1/me/journey/plans/{planId}/race-result"), body);

    private static Task<HttpResponseMessage> StartRecovery(HttpClient client, object body) =>
        client.PostAsJsonAsync(Url("/api/v1/me/journey/recovery"), body);

    private static Task<HttpResponseMessage> Change(HttpClient client, Guid id, object body) =>
        client.PatchAsJsonAsync(Url($"/api/v1/me/journey/recovery/{id}"), body);

    private static Task<HttpResponseMessage> CheckIn(HttpClient client, Guid id, object body) =>
        client.PostAsJsonAsync(Url($"/api/v1/me/journey/recovery/{id}/check-ins"), body);

    private static object ManualHalf(string raceDate = "2026-10-05") =>
        new { eventName = "Harbour Half", distanceKm = 21.1, raceDate, effort = "Hard", preference = "Walk" };

    [Fact]
    public async Task A_signed_out_or_new_runner_has_an_empty_journey()
    {
        var anonymous = await factory.CreateClient().GetAsync(Url("/api/v1/me/journey"));
        anonymous.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        var (client, _) = await Runner();
        var journey = await Json(await client.GetAsync(Url("/api/v1/me/journey")));
        journey.GetProperty("chapters").GetArrayLength().ShouldBe(0);
        journey.GetProperty("recovery").ValueKind.ShouldBe(JsonValueKind.Null);
        journey.GetProperty("maintenance").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task A_race_date_passing_is_never_a_finish_until_the_runner_records_one_and_undoing_it_takes_the_badge_back()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);

        var pending = await Chapter(client, plan);
        pending.GetProperty("lifecycle").GetString().ShouldBe("RacePending");
        pending.GetProperty("raceResult").ValueKind.ShouldBe(JsonValueKind.Null);
        Kinds(pending).ShouldBeEmpty();
        pending.GetProperty("training").GetProperty("recordedKm").ValueKind.ShouldBe(JsonValueKind.Null);
        pending.GetProperty("goalTime").GetString().ShouldBe("00:52:00");

        var saved = await Json(await PutResult(client, plan, new { outcome = "Finished", finishTime = "00:50:30" }));
        saved.GetProperty("raceDate").GetString().ShouldBe("2026-10-04");
        saved.GetProperty("versusGoal").GetString().ShouldBe("-00:01:30");
        saved.GetProperty("goalTime").GetString().ShouldBe("00:52:00");
        saved.GetProperty("version").GetString().ShouldNotBeNullOrEmpty();

        var finished = await Chapter(client, plan);
        finished.GetProperty("lifecycle").GetString().ShouldBe("RaceCompleted");
        Kinds(finished).ShouldBe(["RaceFinished"]);
        finished.GetProperty("achievements")[0].GetProperty("earnedOn").GetString().ShouldBe("2026-10-04");

        // A result that says they didn't finish takes the finisher badge away; a finish gives it back.
        await Json(await PutResult(client, plan, new { outcome = "DidNotFinish", distanceKm = 7.5 }));
        Kinds(await Chapter(client, plan)).ShouldBeEmpty();
        (await Chapter(client, plan)).GetProperty("lifecycle").GetString().ShouldBe("RaceNotCompleted");
        await Json(await PutResult(client, plan, new { outcome = "Finished" }));

        (await client.DeleteAsync(Url($"/api/v1/me/journey/plans/{plan}/race-result"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var undone = await Chapter(client, plan);
        undone.GetProperty("raceResult").ValueKind.ShouldBe(JsonValueKind.Null);
        Kinds(undone).ShouldBeEmpty();
        undone.GetProperty("lifecycle").GetString().ShouldBe("RacePending");
        (await client.DeleteAsync(Url($"/api/v1/me/journey/plans/{plan}/race-result"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task A_race_result_is_for_race_day_or_after_and_links_only_the_runners_own_run()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);

        (await PutResult(client, plan, new { outcome = "Finished", raceDate = "2026-10-09" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await PutResult(client, plan, new { outcome = "Finished", raceDate = "2026-08-01" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await PutResult(client, plan, new { outcome = "Finished", finishTime = "00:00:30" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await PutResult(client, plan, new { outcome = "Finished", distanceKm = 401 })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await PutResult(client, plan, new { outcome = "Finished", note = new string('x', 281) })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await PutResult(client, plan, new { outcome = "Finished", activityId = Guid.NewGuid() })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    private async Task<Activity> RaceRecording(Guid runnerId, ActivityOrigin origin)
    {
        var recording = new ActivityRecording(new DateTimeOffset(2026, 10, 4, 6, 0, 0, TimeSpan.Zero), ActivityKind.Run,
            [new(TimeSpan.Zero, 0), new(TimeSpan.FromSeconds(1500), 5000), new(TimeSpan.FromSeconds(1620), 5000), new(TimeSpan.FromSeconds(3150), 10150)], DeviceTotals.None);
        var activity = Activity.Record(runnerId, recording, PastRace, [], origin);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        db.Activities.Add(activity);
        await db.SaveChangesAsync();
        return activity;
    }

    [Theory]
    [InlineData(SavedPlanStatus.Active)]
    [InlineData(SavedPlanStatus.Archived)]
    public async Task An_existing_Strava_recording_can_be_confirmed_edited_reloaded_and_undone_on_any_chapter(SavedPlanStatus status)
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId, status);
        var activity = await RaceRecording(runnerId, ActivityOrigin.Strava(263, StartLineApiFactory.Now, false));

        var pending = await Chapter(client, plan);
        pending.GetProperty("raceResult").ValueKind.ShouldBe(JsonValueKind.Null);
        Kinds(pending).ShouldBeEmpty();
        var detail = await Json(await client.GetAsync(Url($"/api/v1/me/activities/{activity.Id}")));
        detail.GetProperty("movingSeconds").GetDouble().ShouldBe(3030);
        detail.GetProperty("elapsedSeconds").GetDouble().ShouldBe(3150);

        var saved = await Json(await PutResult(client, plan, new { outcome = "Finished", raceDate = "2026-10-04", finishTime = "00:52:30", distanceKm = 10.15, activityId = activity.Id }));
        var reloaded = await Chapter(client, plan);
        reloaded.GetProperty("raceResult").GetProperty("activityId").GetGuid().ShouldBe(activity.Id);
        reloaded.GetProperty("raceResult").GetProperty("distanceKm").GetDouble().ShouldBe(10.15);
        reloaded.GetProperty("raceResult").GetProperty("finishTime").GetString().ShouldBe("00:52:30");
        Kinds(reloaded).ShouldBe(["RaceFinished"]);

        var edited = await Json(await PutResult(client, plan, new { outcome = "Finished", finishTime = "00:52:00", distanceKm = 10.15, activityId = activity.Id, expectedVersion = saved.GetProperty("version").GetString() }));
        edited.GetProperty("id").GetGuid().ShouldBe(saved.GetProperty("id").GetGuid());
        (await Chapter(client, plan)).GetProperty("raceResult").GetProperty("finishTime").GetString().ShouldBe("00:52:00");
        var recoveryBody = new { planId = plan, eventName = "Spring 10K", distanceKm = 10.15, raceDate = "2026-10-04", effort = "Hard", preference = "Walk" };
        var recovery = await Json(await StartRecovery(client, recoveryBody));
        recovery.GetProperty("planId").GetGuid().ShouldBe(plan);
        recovery.GetProperty("raceDate").GetString().ShouldBe("2026-10-04");
        recovery.GetProperty("distanceKm").GetDouble().ShouldBe(10.15);
        (await Json(await StartRecovery(client, recoveryBody))).GetProperty("id").GetGuid().ShouldBe(recovery.GetProperty("id").GetGuid());
        (await client.DeleteAsync(Url($"/api/v1/me/journey/plans/{plan}/race-result"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var undone = await Chapter(client, plan);
        undone.GetProperty("raceResult").ValueKind.ShouldBe(JsonValueKind.Null);
        Kinds(undone).ShouldBeEmpty();
    }

    [Fact]
    public async Task An_expired_or_another_runners_recording_cannot_confirm_a_finish()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);
        var expired = await RaceRecording(runnerId, ActivityOrigin.Strava(264, StartLineApiFactory.Now.AddDays(-8), false));
        var (_, otherRunner) = await Runner();
        var foreign = await RaceRecording(otherRunner, ActivityOrigin.Upload);

        foreach (var recording in new[] { expired, foreign })
        {
            (await client.GetAsync(Url($"/api/v1/me/activities/{recording.Id}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
            (await PutResult(client, plan, new { outcome = "Finished", finishTime = "00:52:30", distanceKm = 10.15, activityId = recording.Id })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        }

        var pending = await Chapter(client, plan);
        pending.GetProperty("raceResult").ValueKind.ShouldBe(JsonValueKind.Null);
        Kinds(pending).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_stale_version_is_refused_with_a_conflict_and_a_plain_retry_is_idempotent()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);

        var first = await Json(await PutResult(client, plan, new { outcome = "Finished", finishTime = "00:51:00" }));
        var v1 = first.GetProperty("version").GetString();
        var second = await Json(await PutResult(client, plan, new { outcome = "Finished", finishTime = "00:50:00", expectedVersion = v1 }));
        second.GetProperty("id").GetGuid().ShouldBe(first.GetProperty("id").GetGuid());
        second.GetProperty("version").GetString().ShouldNotBe(v1);

        var stale = await PutResult(client, plan, new { outcome = "Finished", finishTime = "00:49:00", expectedVersion = v1 });
        stale.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Code(stale)).ShouldBe("race_result_changed");

        // The same request sent twice at once (a double tap, a retry) is one result and one badge.
        var twice = await Task.WhenAll(
            PutResult(client, plan, new { outcome = "Finished", finishTime = "00:50:00" }),
            PutResult(client, plan, new { outcome = "Finished", finishTime = "00:50:00" }));
        twice.ShouldAllBe(r => r.StatusCode == HttpStatusCode.OK);
        Kinds(await Chapter(client, plan)).ShouldBe(["RaceFinished"]);

        // Also when the first result is created by both at once.
        // Use an independent runner: a second chapter for this runner's same event must now be rejected as a duplicate.
        var (freshClient, freshRunner) = await Runner();
        var fresh = await PastPlan(freshRunner);
        var created = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => PutResult(freshClient, fresh, new { outcome = "Finished", finishTime = "00:55:00" })));
        created.ShouldAllBe(r => r.StatusCode == HttpStatusCode.OK);
        (await Task.WhenAll(created.Select(async r => (await Json(r)).GetProperty("id").GetGuid()))).Distinct().ShouldHaveSingleItem();
        var chapter = await Chapter(freshClient, fresh);
        Kinds(chapter).ShouldBe(["RaceFinished"]);
        chapter.GetProperty("raceResult").GetProperty("versusGoal").GetString().ShouldBe("+00:03:00");
    }

    [Fact]
    public async Task A_past_plan_that_already_qualifies_is_awarded_on_first_read_once_and_keeps_its_badge()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId, SavedPlanStatus.Archived);
        await TickAll(client, plan);

        // Several reads at once (devices, tabs) award it once.
        var reads = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.GetAsync(Url("/api/v1/me/journey"))));
        reads.ShouldAllBe(r => r.StatusCode == HttpStatusCode.OK);
        var chapter = await Chapter(client, plan);
        chapter.GetProperty("status").GetString().ShouldBe("Archived");
        chapter.GetProperty("lifecycle").GetString().ShouldBe("Archived");
        chapter.GetProperty("training").GetProperty("allConfirmed").GetBoolean().ShouldBeTrue();
        Kinds(chapter).ShouldBe(["TrainingComplete"]);
        var award = chapter.GetProperty("achievements")[0];
        award.GetProperty("celebratedAt").ValueKind.ShouldBe(JsonValueKind.Null);

        // Celebrated once, on any device.
        var id = award.GetProperty("id").GetGuid();
        (await client.PostAsync(Url($"/api/v1/me/journey/achievements/{id}/celebrated"), null)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var celebratedAt = (await Chapter(client, plan)).GetProperty("achievements")[0].GetProperty("celebratedAt").GetDateTimeOffset();
        (await client.PostAsync(Url($"/api/v1/me/journey/achievements/{id}/celebrated"), null)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Chapter(client, plan)).GetProperty("achievements")[0].GetProperty("celebratedAt").GetDateTimeOffset().ShouldBe(celebratedAt);

        // A past plan keeps what it earned.
        await Untick(plan);
        Kinds(await Chapter(client, plan)).ShouldBe(["TrainingComplete"]);
    }

    [Fact]
    public async Task The_current_plans_training_badge_is_withdrawn_when_a_run_is_unticked()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);
        await TickAll(client, plan);

        var chapter = await Chapter(client, plan);
        Kinds(chapter).ShouldBe(["TrainingComplete"]);
        chapter.GetProperty("training").GetProperty("plannedKmConfirmed").GetDouble().ShouldBeGreaterThan(0);
        chapter.GetProperty("training").GetProperty("recordedKm").ValueKind.ShouldBe(JsonValueKind.Null);

        await Untick(plan);
        var after = await Chapter(client, plan);
        Kinds(after).ShouldBeEmpty();
        after.GetProperty("training").GetProperty("unansweredRuns").GetInt32().ShouldBe(1);
    }

    [Fact]
    public async Task The_chapter_route_gives_weeks_and_the_journey_list_does_not()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);

        (await Chapter(client, plan)).GetProperty("weeks").ValueKind.ShouldBe(JsonValueKind.Null);
        var detail = await Json(await client.GetAsync(Url($"/api/v1/me/journey/plans/{plan}")));
        detail.GetProperty("weeks").GetArrayLength().ShouldBe(detail.GetProperty("training").GetProperty("weeks").GetInt32());
        detail.GetProperty("startDate").GetString().ShouldBe("2026-08-10");
    }

    [Fact]
    public async Task Another_runners_plans_recoveries_and_badges_are_not_found()
    {
        var (owner, ownerId) = await Runner();
        var plan = await PastPlan(ownerId);
        await TickAll(owner, plan);
        await Json(await PutResult(owner, plan, new { outcome = "Finished" }));
        var recovery = (await Json(await StartRecovery(owner, new { planId = plan, distanceKm = 10, raceDate = "2026-10-04", effort = "Hard", preference = "Rest" }))).GetProperty("id").GetGuid();
        var badge = (await Chapter(owner, plan)).GetProperty("achievements")[0].GetProperty("id").GetGuid();
        var (other, _) = await Runner();

        (await other.GetAsync(Url($"/api/v1/me/journey/plans/{plan}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await PutResult(other, plan, new { outcome = "Finished" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await other.DeleteAsync(Url($"/api/v1/me/journey/plans/{plan}/race-result"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await other.PostAsync(Url($"/api/v1/me/journey/achievements/{badge}/celebrated"), null)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await StartRecovery(other, new { planId = plan, distanceKm = 10, raceDate = "2026-10-04", effort = "Hard", preference = "Rest" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Change(other, recovery, new { action = "End" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await CheckIn(other, recovery, new { feeling = "GoodToGo" })).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Json(await other.GetAsync(Url("/api/v1/me/journey")))).GetProperty("chapters").GetArrayLength().ShouldBe(0);

        // The owner's data is untouched.
        (await Chapter(owner, plan)).GetProperty("raceResult").GetProperty("outcome").GetString().ShouldBe("Finished");
    }

    [Fact]
    public async Task Recovery_follows_a_race_that_was_run_and_starting_it_again_returns_the_same_one()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);
        object Body() => new { planId = plan, distanceKm = 10, raceDate = "2026-10-04", effort = "Hard", preference = "Walk" };

        var noResult = await StartRecovery(client, Body());
        noResult.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Code(noResult)).ShouldBe("race_result_required");
        await Json(await PutResult(client, plan, new { outcome = "DidNotStart" }));
        (await StartRecovery(client, Body())).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await Json(await PutResult(client, plan, new { outcome = "Finished" }));

        var both = await Task.WhenAll(StartRecovery(client, Body()), StartRecovery(client, Body()));
        both.Select(r => r.StatusCode).Order().ShouldBe([HttpStatusCode.OK, HttpStatusCode.Created]);
        var ids = await Task.WhenAll(both.Select(async r => (await Json(r)).GetProperty("id").GetGuid()));
        ids.Distinct().ShouldHaveSingleItem();
        var again = await StartRecovery(client, Body());
        again.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Json(again)).GetProperty("id").GetGuid().ShouldBe(ids[0]);

        var recovery = await Json(again);
        recovery.GetProperty("category").GetString().ShouldBe("TenK");
        recovery.GetProperty("raceDate").GetString().ShouldBe("2026-10-04");
        recovery.GetProperty("eventName").GetString().ShouldBe("Spring 10K");
        recovery.GetProperty("framing").GetString().ShouldBe("about 3–7 days");
        recovery.GetProperty("generatorVersion").GetInt32().ShouldBe(1);
        (await Chapter(client, plan)).GetProperty("lifecycle").GetString().ShouldBe("Recovering");

        // One recovery at a time.
        var second = await StartRecovery(client, ManualHalf());
        second.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Code(second)).ShouldBe("recovery_active");
    }

    [Fact]
    public async Task Check_ins_gate_the_recovery_and_replace_each_other_on_the_same_day()
    {
        var (client, _) = await Runner();
        var created = await StartRecovery(client, ManualHalf());
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var recovery = await Json(created);
        var id = recovery.GetProperty("id").GetGuid();
        recovery.GetProperty("readiness").GetString().ShouldBe("NotCheckedIn");
        recovery.GetProperty("dayNumber").GetInt32().ShouldBe(3);
        recovery.GetProperty("planId").ValueKind.ShouldBe(JsonValueKind.Null);
        Days(recovery).ShouldNotContain(d => d.GetProperty("kind").GetString() == "EasyRun");
        Days(recovery).ShouldContain(d => d.GetProperty("gated").GetBoolean());

        var ready = await Json(await CheckIn(client, id, new { feeling = "GoodToGo" }));
        ready.GetProperty("canComplete").GetBoolean().ShouldBeTrue();
        Days(ready).ShouldContain(d => d.GetProperty("kind").GetString() == "EasyRun");
        Days(ready).ShouldAllBe(d => !d.GetProperty("gated").GetBoolean());

        var sore = await Json(await CheckIn(client, id, new { feeling = "StillSore", note = "calves" }));
        sore.GetProperty("checkIns").GetArrayLength().ShouldBe(1);
        sore.GetProperty("readiness").GetString().ShouldBe("StillSore");
        Days(sore).ShouldNotContain(d => d.GetProperty("kind").GetString() == "EasyRun");

        var flagged = await Json(await CheckIn(client, id, new { feeling = "GoodToGo", redFlags = new[] { "ChestPain" } }));
        flagged.GetProperty("seekCare").GetBoolean().ShouldBeTrue();
        flagged.GetProperty("phase").GetString().ShouldBe("SeekCare");
        flagged.GetProperty("safetyMessage").GetString()!.ShouldContain("urgent");
        Days(flagged).Where(d => string.CompareOrdinal(d.GetProperty("date").GetString(), "2026-10-08") >= 0)
            .ShouldAllBe(d => d.GetProperty("kind").GetString() == "SeekCare" && d.GetProperty("maxMinutes").ValueKind == JsonValueKind.Null);

        var notReady = await Change(client, id, new { action = "Complete" });
        notReady.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Code(notReady)).ShouldBe("recovery_not_ready");

        // An earlier day can be answered too, but not one still to come or before the race.
        (await CheckIn(client, id, new { date = "2026-10-06", feeling = "VeryFatigued" })).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await CheckIn(client, id, new { date = "2026-10-09", feeling = "GoodToGo" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await CheckIn(client, id, new { date = "2026-10-04", feeling = "GoodToGo" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Pause_resume_extend_finish_and_restart_and_a_stale_version_conflicts()
    {
        var (client, _) = await Runner();
        var recovery = await Json(await StartRecovery(client, ManualHalf()));
        var id = recovery.GetProperty("id").GetGuid();
        var endsOn = recovery.GetProperty("endsOn").GetString();
        var v1 = recovery.GetProperty("version").GetString();

        var paused = await Json(await Change(client, id, new { action = "Pause", expectedVersion = v1 }));
        paused.GetProperty("status").GetString().ShouldBe("Paused");
        paused.GetProperty("phase").GetString().ShouldBe("Paused");
        paused.GetProperty("pauses")[0].GetProperty("from").GetString().ShouldBe("2026-10-08");
        paused.GetProperty("pauses")[0].GetProperty("to").ValueKind.ShouldBe(JsonValueKind.Null);

        var stale = await Change(client, id, new { action = "Resume", expectedVersion = v1 });
        stale.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Code(stale)).ShouldBe("recovery_changed");

        var resumed = await Json(await Change(client, id, new { action = "Resume" }));
        resumed.GetProperty("status").GetString().ShouldBe("Active");
        resumed.GetProperty("pauses").GetArrayLength().ShouldBe(0);

        (await Change(client, id, new { action = "Extend", extendDays = 20 })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var extended = await Json(await Change(client, id, new { action = "Extend", extendDays = 3 }));
        extended.GetProperty("extraDays").GetInt32().ShouldBe(3);
        DateOnly.Parse(extended.GetProperty("endsOn").GetString()!, System.Globalization.CultureInfo.InvariantCulture)
            .ShouldBe(DateOnly.Parse(endsOn!, System.Globalization.CultureInfo.InvariantCulture).AddDays(3));

        var updated = await Json(await Change(client, id, new { action = "Update", preference = "CrossTraining", runDays = new[] { "Monday", "Wednesday", "Friday" } }));
        updated.GetProperty("preference").GetString().ShouldBe("CrossTraining");
        updated.GetProperty("runDays").EnumerateArray().Select(d => d.GetString()).ShouldBe(["Monday", "Wednesday", "Friday"]);

        await Json(await CheckIn(client, id, new { feeling = "GoodToGo" }));
        var done = await Json(await Change(client, id, new { action = "Complete" }));
        done.GetProperty("status").GetString().ShouldBe("Completed");
        done.GetProperty("endedOn").GetString().ShouldBe("2026-10-08");
        (await Change(client, id, new { action = "Complete" })).StatusCode.ShouldBe(HttpStatusCode.OK);
        var closed = await CheckIn(client, id, new { feeling = "GoodToGo" });
        closed.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await Code(closed)).ShouldBe("recovery_closed");

        // Finished recoveries stay on the journey for a while, and a new one can start.
        (await Json(await client.GetAsync(Url("/api/v1/me/journey")))).GetProperty("recovery").GetProperty("status").GetString().ShouldBe("Completed");
        var restarted = await Json(await Change(client, id, new { action = "Restart" }));
        restarted.GetProperty("status").GetString().ShouldBe("Active");
        restarted.GetProperty("phase").GetString().ShouldBe("Rest");
        restarted.GetProperty("endedOn").ValueKind.ShouldBe(JsonValueKind.Null);
        (await Change(client, id, new { action = "End" })).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_recovery_outside_a_plan_is_for_an_event_in_the_last_60_days()
    {
        var (client, _) = await Runner();

        (await StartRecovery(client, ManualHalf("2026-08-08"))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await StartRecovery(client, ManualHalf("2026-10-09"))).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await StartRecovery(client, new { distanceKm = 0, raceDate = "2026-10-05", effort = "Hard", preference = "Walk" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await StartRecovery(client, ManualHalf("2026-08-09"))).StatusCode.ShouldBe(HttpStatusCode.Created);
        (await StartRecovery(client, ManualHalf("2026-08-09"))).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Easy_running_starts_once_changes_in_place_and_ends()
    {
        var (client, runnerId) = await Runner();
        await PastPlan(runnerId);

        (await client.PostAsJsonAsync(Url("/api/v1/me/journey/maintenance"), new { daysPerWeek = 5 })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await client.PostAsJsonAsync(Url("/api/v1/me/journey/maintenance"), new { daysPerWeek = 3, runDays = new[] { "Monday" } })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var started = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/journey/maintenance"), new { daysPerWeek = 3, includeStrength = true }));
        started.GetProperty("status").GetString().ShouldBe("Active");
        started.GetProperty("startedOn").GetString().ShouldBe("2026-10-08");
        // The last plan's days: Tuesday, Thursday, Saturday and Sunday, three of them spread out.
        started.GetProperty("runDays").EnumerateArray().Select(d => d.GetString()).ShouldBe(["Tuesday", "Thursday", "Saturday"]);
        started.GetProperty("weeks").GetArrayLength().ShouldBe(4);
        started.GetProperty("weeks")[1].GetProperty("sessions").EnumerateArray().Select(s => s.GetProperty("kind").GetString())
            .ShouldBe(["Strength", "EasyRun", "EasyRun", "LongerEasyRun"]);

        var same = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/journey/maintenance"), new { daysPerWeek = 3, includeStrength = true }));
        same.GetProperty("id").GetGuid().ShouldBe(started.GetProperty("id").GetGuid());
        same.GetProperty("version").GetString().ShouldBe(started.GetProperty("version").GetString());
        var changed = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/journey/maintenance"), new { daysPerWeek = 2 }));
        changed.GetProperty("id").GetGuid().ShouldBe(started.GetProperty("id").GetGuid());
        changed.GetProperty("daysPerWeek").GetInt32().ShouldBe(2);

        (await Json(await client.GetAsync(Url("/api/v1/me/journey")))).GetProperty("maintenance").GetProperty("id").GetGuid().ShouldBe(started.GetProperty("id").GetGuid());
        (await client.DeleteAsync(Url("/api/v1/me/journey/maintenance"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await Json(await client.GetAsync(Url("/api/v1/me/journey")))).GetProperty("maintenance").ValueKind.ShouldBe(JsonValueKind.Null);
        (await client.DeleteAsync(Url("/api/v1/me/journey/maintenance"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.PostAsJsonAsync(Url("/api/v1/me/journey/maintenance"), new { daysPerWeek = 2 })).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Removing_a_plan_with_a_race_result_archives_it_and_one_without_journey_data_is_deleted()
    {
        var (client, runnerId) = await Runner();
        var raced = await PastPlan(runnerId, SavedPlanStatus.Archived);
        await Json(await PutResult(client, raced, new { outcome = "Finished" }));
        var bare = await PastPlan(runnerId);

        (await client.DeleteAsync(Url($"/api/v1/me/plans/{raced}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.DeleteAsync(Url($"/api/v1/me/plans/{bare}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{raced}")))).GetProperty("status").GetString().ShouldBe("Archived");
        (await client.GetAsync(Url($"/api/v1/me/plans/{bare}"))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        Kinds(await Chapter(client, raced)).ShouldBe(["RaceFinished"]);
    }

    [Fact]
    public async Task The_export_holds_the_journey_and_deleting_the_account_removes_it()
    {
        var (client, runnerId) = await Runner();
        var plan = await PastPlan(runnerId);
        await Json(await PutResult(client, plan, new { outcome = "Finished", note = "Windy" }));
        await Json(await StartRecovery(client, new { planId = plan, distanceKm = 10, raceDate = "2026-10-04", effort = "Easy", preference = "Rest" }));
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/journey/maintenance"), new { daysPerWeek = 2 }));
        await client.GetAsync(Url("/api/v1/me/journey"));

        var journey = (await Json(await client.GetAsync(Url("/api/v1/me/export")))).GetProperty("journey");
        journey.GetProperty("raceResults").EnumerateArray().ToList().ShouldHaveSingleItem().GetProperty("note").GetString().ShouldBe("Windy");
        journey.GetProperty("achievements").GetArrayLength().ShouldBe(1);
        journey.GetProperty("recoveries").GetArrayLength().ShouldBe(1);
        journey.GetProperty("maintenance").GetArrayLength().ShouldBe(1);

        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.RaceResults.CountAsync(r => r.RunnerId == runnerId)).ShouldBe(0);
        (await db.Achievements.CountAsync(a => a.RunnerId == runnerId)).ShouldBe(0);
        (await db.RecoveryPlans.CountAsync(r => r.RunnerId == runnerId)).ShouldBe(0);
        (await db.MaintenancePlans.CountAsync(m => m.RunnerId == runnerId)).ShouldBe(0);
    }

    private static List<JsonElement> Days(JsonElement recovery) => [.. recovery.GetProperty("days").EnumerateArray()];
}

/// <summary>A factory of its own, so this class's runners and clock are never shared with another class.</summary>
public sealed class JourneyFactory : StartLineApiFactory;
