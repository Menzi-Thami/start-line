using System.Net;
using System.Net.Http.Json;

namespace StartLine.Integration.Tests;

/// <summary>Its own factory, so exhausting limits here can't leak 429s into other tests.</summary>
public sealed class PerRunnerRateLimitTests : IDisposable
{
    private readonly StartLineApiFactory _factory = new();

    private static readonly object Plan = new
    {
        raceSlug = "comrades-2027",
        goalTime = "10:30:00",
        runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
    };

    [Fact]
    public async Task Signed_in_runners_on_the_same_network_get_their_own_limits()
    {
        // Same IP for both (the factory pins it), different runners.
        var busy = _factory.CreateClient().As(Guid.NewGuid().ToString());
        var neighbour = _factory.CreateClient().As(Guid.NewGuid().ToString());

        for (var i = 0; i < 30; i++)
        {
            (await busy.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), Plan)).StatusCode.ShouldBe(HttpStatusCode.OK);
        }

        (await busy.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), Plan)).StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        (await neighbour.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), Plan)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    public void Dispose() => _factory.Dispose();
}
