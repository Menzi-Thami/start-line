using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Races;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Persistence.Migrations;
using StartLine.Infrastructure.Races;

namespace StartLine.Integration.Tests;

/// <summary>New South African race editions are search-only, and every offered distance is a distinct plan target.</summary>
public sealed class SouthAfricanRaceCatalogueTests
{
    [Fact]
    public void Curated_seed_is_additive_idempotent_and_includes_short_races_and_half_marathons()
    {
        var migration = new AddSouthAfricanShortDistanceRaces();
        var sql = migration.UpOperations.OfType<SqlOperation>().ShouldHaveSingleItem().Sql;

        // SQL guards each slug, so an event manually added earlier doesn't break an environment's deployment.
        Regex.Matches(sql, "IF NOT EXISTS", RegexOptions.CultureInvariant).Count.ShouldBe(70);
        sql.ShouldContain("WHERE [Slug]");
        sql.ShouldContain("'hoka-half-runfest-5km-2027'");
        sql.ShouldContain("'hoka-half-runfest-10km-2027'");
        sql.ShouldContain("'hoka-half-runfest-half-marathon-2027'");
        sql.ShouldContain("'sasol-secunda-5km-2027'");
        sql.ShouldContain("'capital-city-marathon-10km-2027'");
        sql.ShouldContain("'know-who-you-are-half-marathon-2027'");
        sql.ShouldContain("'cape-town-peace-run-5km-2027'");
        sql.ShouldContain("'mielie-marathon-5km-2027'");
        sql.ShouldContain("'pamoja-athletics-marathon-half-marathon-2027'");
        sql.ShouldContain("'meerkat-marathon-10km-2027'");
        sql.ShouldContain("'bieliemielie-marathon-half-marathon-2027'");
        sql.ShouldContain("'first-choice-15km-2027'");
        sql.ShouldNotContain("'two-oceans-half-marathon-2027'"); // Already exists, so don't duplicate it.
        sql.ShouldContain(", 1, 0);"); // Distance confirmed, but never place a short race on headline rack.
    }

    [Fact]
    public async Task One_event_with_three_distances_is_searchable_but_not_on_headline_rack_and_can_build_exact_plans()
    {
        using var factory = new StartLineApiFactory();
        var client = factory.CreateClient();
        var slugs = new[] { "south-africa-seed-test-5km-2027", "south-africa-seed-test-10km-2027", "south-africa-seed-test-half-marathon-2027" };
        var kms = new[] { 5d, 10d, 21.0975d };
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            await db.CatalogueRaces.Where(r => slugs.Contains(r.Slug)).ExecuteDeleteAsync();
            db.CatalogueRaces.AddRange(slugs.Select((slug, i) => new CatalogueRace
            {
                Slug = slug,
                Name = i switch { 0 => "Example Coastal Road Race 5 km", 1 => "Example Coastal Road Race 10 km", _ => "Example Coastal Road Race Half Marathon" },
                Date = new DateOnly(2027, 2, 13),
                DistanceKm = kms[i],
                Location = "Gqeberha, Eastern Cape",
                Summary = "Isolated synthetic searchable catalogue fixture.",
                DateConfirmed = true,
                DateSource = "https://example.org/fixture",
                DistanceConfirmed = true,
                Major = false,
            }));
            await db.SaveChangesAsync();
        }

        try
        {
            await factory.Services.GetRequiredService<RaceCalendarSync>().RunAsync(CancellationToken.None);

            var results = await client.GetFromJsonAsync<JsonElement>("/api/v1/races/search?q=Example%20Coastal");
            var found = results.EnumerateArray().ToDictionary(e => e.GetProperty("slug").GetString()!, e => e);
            found.Keys.OrderBy(x => x).ToArray().ShouldBe(slugs.OrderBy(x => x).ToArray());
            for (var i = 0; i < slugs.Length; i++)
            {
                found[slugs[i]].GetProperty("distanceKm").GetDouble().ShouldBe(kms[i]);
                found[slugs[i]].GetProperty("major").GetBoolean().ShouldBeFalse();
            }

            var headline = await client.GetFromJsonAsync<JsonElement>("/api/v1/races");
            headline.EnumerateArray().Select(e => e.GetProperty("slug").GetString()).ShouldNotContain(slugs[0]);

            foreach (var (slug, km, goal) in new[]
            {
                (slugs[0], 5d, "00:29:00"),
                (slugs[1], 10d, "01:00:00"),
                (slugs[2], 21.0975d, "02:05:00"),
            })
            {
                var response = await client.PostAsJsonAsync("/api/v1/plans", new
                {
                    raceSlug = slug,
                    goalTime = goal,
                    runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
                    longRunDay = "Sunday",
                    currentWeeklyKm = 20,
                });
                response.StatusCode.ShouldBe(HttpStatusCode.OK);
                var plan = await response.Content.ReadFromJsonAsync<JsonElement>();
                plan.GetProperty("race").GetProperty("distanceKm").GetDouble().ShouldBe(km);
            }
        }
        finally
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            await db.CatalogueRaces.Where(r => slugs.Contains(r.Slug)).ExecuteDeleteAsync();
        }
    }
}
