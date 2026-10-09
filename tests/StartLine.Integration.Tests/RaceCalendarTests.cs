using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Races;
using StartLine.Domain.Races;
using StartLine.Infrastructure.Races;

namespace StartLine.Integration.Tests;

public sealed class RaceCalendarTests
{
    /// <summary>An extra source that announces a race only from its second fetch onwards.</summary>
    private sealed class LateAnnouncementSource : IRaceSource
    {
        private int _fetches;

        public int Fetches => _fetches;

        public string Name => "Organiser feed";

        public Task<IReadOnlyList<RaceObservation>> FetchAsync(CancellationToken cancellationToken)
        {
            IReadOnlyList<RaceObservation> races = Interlocked.Increment(ref _fetches) < 2
                ? []
                : [new("Organiser feed", 100, "soweto-marathon-2027", "Soweto Marathon", new DateOnly(2027, 11, 7), 42.195, true, true, "Soweto", "", null)];
            return Task.FromResult(races);
        }
    }

    private sealed class FactoryWithFeed(LateAnnouncementSource feed) : StartLineApiFactory
    {
        protected override void ConfigureServices(IServiceCollection services) => services.AddSingleton<IRaceSource>(feed);
    }

    private static async Task<List<JsonElement>> Races(HttpClient client) =>
        [.. (await client.GetFromJsonAsync<JsonElement>(new Uri("/api/v1/races", UriKind.Relative))).EnumerateArray()];

    [Fact]
    public async Task Races_say_how_sure_their_date_and_distance_are()
    {
        using var factory = new StartLineApiFactory();

        var races = await Races(factory.CreateClient());

        var comrades = races.Single(r => r.GetProperty("slug").GetString() == "comrades-2027");
        comrades.GetProperty("dateStatus").GetString().ShouldBe("Confirmed");
        comrades.GetProperty("distanceConfirmed").GetBoolean().ShouldBeFalse();
        races.Single(r => r.GetProperty("slug").GetString() == "cape-town-marathon-2027")
            .GetProperty("dateStatus").GetString().ShouldBe("Provisional");
    }

    [Fact]
    public async Task The_calendar_picks_up_new_races_on_the_next_scheduled_sync()
    {
        var feed = new LateAnnouncementSource();
        using var factory = new FactoryWithFeed(feed);
        var client = factory.CreateClient();
        (await Races(client)).ShouldNotContain(r => r.GetProperty("slug").GetString() == "soweto-marathon-2027");

        factory.Time.Advance(TimeSpan.FromHours(6));
        await WaitUntil(() => feed.Fetches >= 2);

        await WaitUntil(async () => (await Races(client)).Any(r => r.GetProperty("slug").GetString() == "soweto-marathon-2027"));
    }

    [Fact]
    public void A_sync_interval_under_five_minutes_stops_the_app_at_boot()
    {
        using var factory = new TooFrequentSyncFactory();

        Should.Throw<Exception>(() => factory.CreateClient()).ToString().ShouldContain("at least five minutes");
    }

    private sealed class TooFrequentSyncFactory : StartLineApiFactory
    {
        protected override IDictionary<string, string?> Settings => new Dictionary<string, string?>
        {
            [$"{RaceCalendarOptions.Section}:SyncInterval"] = "00:00:30",
        };
    }

    private static Task WaitUntil(Func<bool> condition) => WaitUntil(() => Task.FromResult(condition()));

    // The worker runs on its own thread once the fake clock fires, so give it a moment of real time.
    private static async Task WaitUntil(Func<Task<bool>> condition)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            if (await condition())
            {
                return;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException("The condition was never met.");
    }
}
