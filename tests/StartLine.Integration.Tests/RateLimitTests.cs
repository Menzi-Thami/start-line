using System.Net;
using System.Net.Http.Json;

namespace StartLine.Integration.Tests;

/// <summary>Its own factory, so exhausting the limit here can't leak 429s into other tests.</summary>
public sealed class RateLimitTests : IDisposable
{
    private readonly StartLineApiFactory _factory = new();

    [Fact]
    public async Task Plan_generation_is_throttled_with_a_retry_after_header()
    {
        var client = _factory.CreateClient();
        var request = new { raceSlug = "comrades-2027", goalTime = "10:30:00", runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" }, longRunDay = "Sunday" };

        HttpResponseMessage? last = null;
        for (var i = 0; i < 31; i++)
        {
            last = await client.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), request);
        }

        last!.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
        last.Headers.Contains("Retry-After").ShouldBeTrue();
    }

    public void Dispose() => _factory.Dispose();
}
