using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Races;
using StartLine.Domain.Plans;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

public sealed class SavedPlanDurabilityTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static Uri Url(string path) => new(path, UriKind.Relative);
    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private async Task<HttpClient> Runner(string subject)
    {
        var client = factory.CreateClient().As(subject);
        await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Synthetic runner",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        }));
        return client;
    }

    private static readonly object CataloguePlan = new
    {
        raceSlug = "comrades-2027",
        goalTime = "11:00:00",
        currentWeeklyKm = 40,
        runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        planFrom = "2026-10-08",
    };

    [Fact]
    public async Task Catalogue_snapshot_survives_archiving_catalogue_removal_and_a_fresh_authenticated_client()
    {
        var subject = Guid.NewGuid().ToString();
        using var client = await Runner(subject);
        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = CataloguePlan }));
        var id = saved.GetProperty("id").GetGuid();
        var original = await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")));
        var race = original.GetProperty("plan").GetProperty("race");
        original.GetProperty("inputs").GetProperty("raceName").GetString().ShouldBe("Comrades Marathon");
        original.GetProperty("inputs").GetProperty("raceDate").GetString().ShouldBe(race.GetProperty("date").GetString());
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            replaceCurrent = true,
            plan = new
            {
                raceName = "Another race",
                distanceKm = 10,
                raceDate = "2027-01-10",
                goalTime = "00:52:00",
                currentWeeklyKm = 25,
                runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
                longRunDay = "Sunday",
            }
        }));

        var catalogue = factory.Services.GetRequiredService<IRaceCatalogue>();
        var store = factory.Services.GetRequiredService<IRaceStore>();
        var all = catalogue.All();
        try
        {
            store.Replace([.. all.Where(r => r.Slug != "comrades-2027")], StartLineApiFactory.Now);
            using var reloaded = factory.CreateClient().As(subject);
            var past = await Json(await reloaded.GetAsync(Url($"/api/v1/me/plans/{id}")));
            past.GetProperty("status").GetString().ShouldBe("Archived");
            past.GetProperty("plan").GetProperty("weeks").GetRawText().ShouldBe(original.GetProperty("plan").GetProperty("weeks").GetRawText());
            var chapter = await Json(await reloaded.GetAsync(Url($"/api/v1/me/journey/plans/{id}")));
            chapter.GetProperty("raceName").GetString().ShouldBe("Comrades Marathon");
            chapter.GetProperty("raceDate").GetString().ShouldBe(race.GetProperty("date").GetString());
            chapter.GetProperty("distanceKm").GetDouble().ShouldBe(race.GetProperty("distanceKm").GetDouble());
            chapter.GetProperty("detailsUnavailable").GetBoolean().ShouldBeFalse();
            chapter.GetProperty("training").GetProperty("scheduledRuns").GetInt32().ShouldBeGreaterThan(0);
        }
        finally { store.Replace(all, StartLineApiFactory.Now); }
    }

    [Fact]
    public async Task Recent_performance_survives_save_reload_edit_replan_and_account_export_and_can_be_removed()
    {
        var subject = Guid.NewGuid().ToString();
        using var client = await Runner(subject);
        var plan = new StartLine.Application.Features.Plans.GeneratePlanQuery(null, "Summer half", 21.0975, new DateOnly(2027, 1, 17),
            TimeSpan.FromHours(2), [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday], DayOfWeek.Sunday, 25,
            PlanFrom: new DateOnly(2026, 10, 8), RecentResultKm: 10, RecentResultTime: TimeSpan.FromMinutes(50), RecentResultDate: new DateOnly(2026, 10, 1));
        var preview = await Json(await client.PostAsJsonAsync(Url("/api/v1/plans"), plan));
        var id = (await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan }))).GetProperty("id").GetGuid();
        using var reload = factory.CreateClient().As(subject);
        var saved = await Json(await reload.GetAsync(Url($"/api/v1/me/plans/{id}")));
        saved.GetProperty("plan").GetProperty("outlook").GetRawText().ShouldBe(preview.GetProperty("outlook").GetRawText());
        saved.GetProperty("inputs").GetProperty("recentResultTime").GetString().ShouldBe("00:50:00");

        var edited = plan with { StrengthDays = [DayOfWeek.Monday] };
        (await Json(await reload.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = edited, replaceCurrent = true, expectedPlanId = id })))
            .GetProperty("id").GetGuid().ShouldBe(id);
        var replanned = await Json(await reload.PostAsJsonAsync(Url($"/api/v1/me/plans/{id}/replan"), new { replanFrom = "2026-10-08", setback = "MissedTraining" }));
        replanned.GetProperty("inputs").GetProperty("recentResultKm").GetDouble().ShouldBe(10);
        replanned.GetProperty("inputs").GetProperty("recentResultDate").GetString().ShouldBe("2026-10-01");
        var export = await Json(await reload.GetAsync(Url("/api/v1/me/export")));
        var exported = export.GetProperty("plans").EnumerateArray().Single(p => p.GetProperty("id").GetGuid() == id);
        exported.GetProperty("inputs").GetProperty("recentResultTime").GetString().ShouldBe("00:50:00");

        await Json(await reload.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            replaceCurrent = true,
            expectedPlanId = id,
            plan = edited with { RecentResultKm = null, RecentResultTime = null, RecentResultDate = null },
        }));
        var cleared = await Json(await reload.GetAsync(Url($"/api/v1/me/plans/{id}")));
        cleared.GetProperty("inputs").GetProperty("recentResultKm").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task A_legacy_plan_without_recoverable_race_details_remains_visible_without_inventing_achievements()
    {
        using var client = await Runner(Guid.NewGuid().ToString());
        var runner = await Json(await client.GetAsync(Url("/api/v1/me")));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var plan = SavedPlan.Create(runner.GetProperty("id").GetGuid(), "My original race", new SavedPlanInputs(
            "a-removed-legacy-race", null, null, null, TimeSpan.FromHours(4),
            [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 30, Experience.Regular, [], new DateOnly(2026, 1, 1)));
        plan.Archive();
        db.SavedPlans.Add(plan);
        await db.SaveChangesAsync();
        var journey = await Json(await client.GetAsync(Url("/api/v1/me/journey")));
        var chapter = journey.GetProperty("chapters").EnumerateArray().Single(c => c.GetProperty("planId").GetGuid() == plan.Id);
        chapter.GetProperty("raceName").GetString().ShouldBe("My original race");
        chapter.GetProperty("detailsUnavailable").GetBoolean().ShouldBeTrue();
        chapter.GetProperty("achievements").GetArrayLength().ShouldBe(0);
        (await db.Achievements.CountAsync(a => a.SavedPlanId == plan.Id)).ShouldBe(0);
        (await client.GetAsync(Url($"/api/v1/me/journey/plans/{plan.Id}"))).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Migration_backfills_curated_and_database_races_without_replacing_existing_snapshots()
    {
        using var client = await Runner(Guid.NewGuid().ToString());
        var runner = (await Json(await client.GetAsync(Url("/api/v1/me")))).GetProperty("id").GetGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var row = new StartLine.Infrastructure.Races.CatalogueRace
        {
            Slug = $"synthetic-catalogue-{Guid.NewGuid():N}",
            Name = "Synthetic historical 10K",
            DistanceKm = 10,
            Date = new DateOnly(2027, 1, 17),
            Location = "Test course",
            Summary = "Synthetic catalogue fixture",
        };
        db.CatalogueRaces.Add(row);
        SavedPlan Legacy(string slug, string? name = null, double? km = null, DateOnly? date = null)
        {
            var saved = SavedPlan.Create(runner, "Legacy plan", new SavedPlanInputs(slug, name, km, date,
                slug == "comrades-2027" ? TimeSpan.FromHours(11) : TimeSpan.FromMinutes(52),
                [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 40, Experience.Regular, [], new DateOnly(2026, 1, 1)));
            saved.Archive();
            return saved;
        }
        var curated = Legacy("comrades-2027");
        var database = Legacy(row.Slug);
        var original = Legacy("comrades-2027", "Name kept at the time", 88, new DateOnly(2027, 6, 12));
        db.SavedPlans.AddRange(curated, database, original);
        await db.SaveChangesAsync();
        // Execute the migration's actual data operations; the complete schema was already migrated by the test host.
        var migration = new StartLine.Infrastructure.Persistence.Migrations.SavedPlanRaceSnapshotsAndOfflineCheckIns();
        foreach (var sql in migration.UpOperations.OfType<SqlOperation>())
            await db.Database.ExecuteSqlRawAsync(sql.Sql);
        db.ChangeTracker.Clear();
        var recovered = await db.SavedPlans.SingleAsync(p => p.Id == curated.Id);
        recovered.Inputs.RaceName.ShouldBe("Comrades Marathon");
        recovered.Inputs.RaceDate.ShouldBe(new DateOnly(2027, 6, 13));
        recovered.Inputs.DistanceKm.ShouldBe(90);
        var fromDatabase = await db.SavedPlans.SingleAsync(p => p.Id == database.Id);
        fromDatabase.Inputs.RaceName.ShouldBe(row.Name);
        fromDatabase.Inputs.RaceDate.ShouldBe(row.Date);
        var retained = await db.SavedPlans.SingleAsync(p => p.Id == original.Id);
        retained.Inputs.RaceName.ShouldBe("Name kept at the time");
        retained.Inputs.RaceDate.ShouldBe(new DateOnly(2027, 6, 12));
        retained.Inputs.DistanceKm.ShouldBe(88);
    }
}
