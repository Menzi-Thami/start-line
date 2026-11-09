using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Races;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Races;

namespace StartLine.Integration.Tests;

/// <summary>
/// The race step lists the headline races; everything else is found by searching, including races kept in the
/// database. Searching ignores case, accents and punctuation, and needs at least two letters.
/// </summary>
public sealed class RaceSearchTests
{
    private static async Task<List<JsonElement>> Get(HttpClient client, string path) =>
        [.. (await client.GetFromJsonAsync<JsonElement>(new Uri(path, UriKind.Relative))).EnumerateArray()];

    private static List<string?> Slugs(List<JsonElement> races) => [.. races.Select(r => r.GetProperty("slug").GetString())];

    [Fact]
    public async Task Search_finds_races_by_name_or_place_and_the_list_shows_only_headline_races()
    {
        using var factory = new StartLineApiFactory();
        var client = factory.CreateClient();

        var listed = await Get(client, "/api/v1/races");
        listed.ShouldAllBe(r => r.GetProperty("major").GetBoolean());

        Slugs(await Get(client, "/api/v1/races/search?q=CAPE%20town%20marathon")).ShouldContain("cape-town-marathon-2027");
        Slugs(await Get(client, "/api/v1/races/search?q=durban")).ShouldContain("comrades-2027");
        (await Get(client, "/api/v1/races/search?q=c")).ShouldBeEmpty();
        (await Get(client, "/api/v1/races/search?q=no%20such%20race")).ShouldBeEmpty();

        (await client.GetFromJsonAsync<JsonElement>(new Uri("/api/v1/races/comrades-2027", UriKind.Relative)))
            .GetProperty("name").GetString().ShouldBe("Comrades Marathon");
        (await client.GetAsync(new Uri("/api/v1/races/no-such-race", UriKind.Relative))).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_race_added_to_the_database_is_searchable_after_the_next_sync_and_can_be_planned()
    {
        using var factory = new StartLineApiFactory();
        var client = factory.CreateClient();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            await db.CatalogueRaces.Where(r => r.Slug == "om-die-dam-test").ExecuteDeleteAsync();
            db.CatalogueRaces.Add(new CatalogueRace
            {
                Slug = "om-die-dam-test", Name = "Om Dié Dam Ultra", Date = new DateOnly(2027, 3, 13), DistanceKm = 50,
                Location = "Hartbeespoort", Summary = "A 50 km loop around the dam.", DateConfirmed = true,
            });
            await db.SaveChangesAsync();
        }

        await factory.Services.GetRequiredService<RaceCalendarSync>().RunAsync(CancellationToken.None);

        var found = await Get(client, "/api/v1/races/search?q=om%20die");
        Slugs(found).ShouldContain("om-die-dam-test");
        found.Single(r => r.GetProperty("slug").GetString() == "om-die-dam-test").GetProperty("major").GetBoolean().ShouldBeFalse();
        Slugs(await Get(client, "/api/v1/races/search?q=hartbeespoort")).ShouldContain("om-die-dam-test");
        Slugs(await Get(client, "/api/v1/races")).ShouldNotContain("om-die-dam-test");

        var plan = await client.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), new
        {
            raceSlug = "om-die-dam-test", goalTime = "05:30:00", runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
            longRunDay = "Sunday", currentWeeklyKm = 30,
        });
        plan.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await plan.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("race").GetProperty("name").GetString().ShouldBe("Om Dié Dam Ultra");

        using var cleanup = factory.Services.CreateScope();
        await cleanup.ServiceProvider.GetRequiredService<StartLineDbContext>().CatalogueRaces.Where(r => r.Slug == "om-die-dam-test").ExecuteDeleteAsync();
    }
}
