using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Domain.Plans;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

public sealed class TrainingLifecycleTests(JourneyFactory factory) : IClassFixture<JourneyFactory>
{
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static object Profile(string zone) => new
    {
        displayName = "Synthetic phase runner",
        timeZone = zone,
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(text);
        return JsonDocument.Parse(text).RootElement;
    }
    private async Task<(HttpClient Client, Guid Runner)> Runner(string zone = "Africa/Johannesburg")
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        var me = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), Profile(zone)));
        return (client, me.GetProperty("id").GetGuid());
    }
    private async Task<Guid> Plan(Guid runner, DateOnly date)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var plan = SavedPlan.Create(runner, "Autumn 10K", new(null, "Autumn 10K", 10, date, TimeSpan.FromMinutes(55),
            [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 25, Experience.Regular, [], new(2026, 8, 10), GeneratorVersion: 2));
        db.SavedPlans.Add(plan);
        await db.SaveChangesAsync();
        return plan.Id;
    }
    private static Task<HttpResponseMessage> NewPlan(HttpClient client) => client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
    {
        name = "Next 10K",
        plan = new
        {
            raceName = "Next 10K",
            distanceKm = 10,
            raceDate = "2026-12-06",
            goalTime = "00:55:00",
            runDays = new[] { "Tuesday", "Thursday", "Sunday" },
            longRunDay = "Sunday",
            currentWeeklyKm = 25,
        },
    });

    [Fact]
    public async Task Race_day_stays_current_until_it_ends_in_the_runners_time_zone()
    {
        var (client, runner) = await Runner("Pacific/Honolulu"); // The pinned clock is still 7 October here.
        using var owned = client;
        var id = await Plan(runner, new(2026, 10, 7));
        var before = await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        before[0].GetProperty("status").GetString().ShouldBe("Active");

        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), Profile("Africa/Johannesburg")));
        var after = await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        after[0].GetProperty("id").GetGuid().ShouldBe(id);
        after[0].GetProperty("status").GetString().ShouldBe("Concluded");
        var journey = await Json(await client.GetAsync(Url("/api/v1/me/journey")));
        var chapter = journey.GetProperty("chapters")[0];
        chapter.GetProperty("lifecycle").GetString().ShouldBe("Concluded");
        chapter.GetProperty("raceResult").ValueKind.ShouldBe(JsonValueKind.Null);
        chapter.GetProperty("achievements").GetArrayLength().ShouldBe(0);
        journey.GetProperty("recovery").ValueKind.ShouldBe(JsonValueKind.Null);
        (await client.PostAsync(Url($"/api/v1/me/plans/{id}/restore"), null)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var next = await Json(await NewPlan(client)); // No replace-current question is necessary.
        next.GetProperty("status").GetString().ShouldBe("Active");
        (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("status").GetString().ShouldBe("Concluded");
    }

    [Fact]
    public async Task An_old_plan_link_cannot_duplicate_a_concluded_chapter_or_replace_new_training()
    {
        var (client, runner) = await Runner();
        using var owned = client;
        var id = await Plan(runner, new(2026, 10, 4));
        var old = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        var next = await Json(await NewPlan(client));
        var rejected = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            name = "Old race again",
            plan = old.GetProperty("inputs"),
            replaceCurrent = true,
        });
        rejected.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await rejected.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString().ShouldBe("training_concluded");
        var retained = await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        retained.GetArrayLength().ShouldBe(2);
        retained.EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == id).GetProperty("status").GetString().ShouldBe("Concluded");
        retained.EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == next.GetProperty("id").GetGuid()).GetProperty("status").GetString().ShouldBe("Active");
    }

    [Fact]
    public async Task Offline_training_check_ins_still_sync_to_their_chapter_but_newer_runs_cannot_extend_it()
    {
        var (client, runner) = await Runner();
        using var owned = client;
        var id = await Plan(runner, new(2026, 10, 4));
        var plan = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        plan.GetProperty("status").GetString().ShouldBe("Concluded");
        var session = plan.GetProperty("plan").GetProperty("weeks").EnumerateArray().SelectMany(week => week.GetProperty("sessions").EnumerateArray())
            .First(session => session.GetProperty("type").GetString() is not ("Strength" or "Race"));
        var date = session.GetProperty("date").GetString();
        var type = session.GetProperty("type").GetString();
        var saved = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/{date}/{type}"), new
        {
            status = "Done",
            distanceKm = 4,
            note = "Saved offline before race day",
        }));
        saved.GetProperty("date").GetString().ShouldBe(date);
        saved.GetProperty("distanceKm").GetDouble().ShouldBe(4);
        (await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{id}/check-ins/2026-10-08/Easy"), new { status = "Done" })).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var history = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}/check-ins")));
        history.GetArrayLength().ShouldBe(1);
        history[0].GetProperty("id").GetGuid().ShouldBe(saved.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Recovery_has_its_own_id_and_days_while_training_stays_concluded_and_a_new_plan_can_start()
    {
        var (client, runner) = await Runner();
        using var owned = client;
        var id = await Plan(runner, new(2026, 10, 4));
        var result = await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/journey/plans/{id}/race-result"), new
        {
            outcome = "Finished",
            raceDate = "2026-10-04",
            finishTime = "00:52:30",
            distanceKm = 10.15,
            timeKind = "OfficialChip",
        }));
        await Json(await client.GetAsync(Url("/api/v1/me/plans")));
        var recovery = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/journey/recovery"), new
        {
            planId = id,
            eventName = "Autumn 10K",
            distanceKm = 10.15,
            raceDate = "2026-10-04",
            effort = "Hard",
            preference = "Walk",
            runDays = Array.Empty<string>(),
        }));
        recovery.GetProperty("id").GetGuid().ShouldNotBe(id);
        recovery.GetProperty("planId").GetGuid().ShouldBe(id); // Provenance, not a shared lifecycle.
        recovery.GetProperty("runDays").EnumerateArray().Select(day => day.GetString()).ShouldBe(["Tuesday", "Thursday", "Sunday"]);
        recovery.GetProperty("days").GetArrayLength().ShouldBeGreaterThan(0);
        var next = await Json(await NewPlan(client));
        var journey = await Json(await client.GetAsync(Url("/api/v1/me/journey")));
        journey.GetProperty("recovery").GetProperty("id").GetGuid().ShouldBe(recovery.GetProperty("id").GetGuid());
        journey.GetProperty("recovery").GetProperty("status").GetString().ShouldBe("Active");
        var past = journey.GetProperty("chapters").EnumerateArray().Single(chapter => chapter.GetProperty("planId").GetGuid() == id);
        past.GetProperty("status").GetString().ShouldBe("Concluded");
        past.GetProperty("lifecycle").GetString().ShouldBe("Concluded");
        past.GetProperty("raceResult").GetProperty("id").GetGuid().ShouldBe(result.GetProperty("id").GetGuid());
        journey.GetProperty("chapters").EnumerateArray().Single(chapter => chapter.GetProperty("planId").GetGuid() == next.GetProperty("id").GetGuid())
            .GetProperty("status").GetString().ShouldBe("Active");
    }

    [Fact]
    public async Task Concurrent_reads_conclude_once_and_keep_the_same_training_record()
    {
        var (client, runner) = await Runner();
        using var owned = client;
        var id = await Plan(runner, new(2026, 10, 4));
        var responses = await Task.WhenAll(client.GetAsync(Url("/api/v1/me/plans")), client.GetAsync(Url("/api/v1/me/journey")),
            client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        foreach (var response in responses) response.IsSuccessStatusCode.ShouldBeTrue(await response.Content.ReadAsStringAsync());
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var retained = await db.SavedPlans.Where(plan => plan.RunnerId == runner).ToListAsync();
        retained.Count.ShouldBe(1);
        retained[0].Id.ShouldBe(id);
        retained[0].Status.ShouldBe(SavedPlanStatus.Concluded);
    }
}
