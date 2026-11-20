using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

/// <summary>The AI and MCP surface must start completely closed, even for signed-in runners.</summary>
public sealed class AiCoachGateTests
{
    [Fact]
    public async Task Ai_is_off_by_default_and_anonymous_users_cannot_access_it()
    {
        await using var factory = new StartLineApiFactory();
        using var anonymous = factory.CreateClient();
        var id = Guid.NewGuid();
        var url = new Uri($"/api/v1/me/plans/{id}/ai/ask", UriKind.Relative);
        (await anonymous.PostAsJsonAsync(url, new { question = "What should I run today?" }))
            .StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        using var signedIn = factory.CreateClient().As(Guid.NewGuid().ToString());
        var status = await signedIn.GetAsync(
            new Uri($"/api/v1/me/plans/{id}/ai/status", UriKind.Relative));
        status.StatusCode.ShouldBe(HttpStatusCode.OK);
        using var json = JsonDocument.Parse(await status.Content.ReadAsStringAsync());
        json.RootElement.GetProperty("enabled").GetBoolean().ShouldBeFalse();

        (await signedIn.PostAsJsonAsync(url, new { question = "What should I run today?" }))
            .StatusCode.ShouldBe(HttpStatusCode.ServiceUnavailable);
        (await signedIn.GetAsync(new Uri("/mcp", UriKind.Relative)))
            .StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}
