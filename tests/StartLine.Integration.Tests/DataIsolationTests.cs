using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;

namespace StartLine.Integration.Tests;

/// <summary>
/// One runner never reaches another runner's data, and nobody reaches a runner's data without signing in. Synthetic
/// runners only, against the disposable test database.
/// </summary>
public sealed class DataIsolationTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static readonly object Profile = new
    {
        displayName = "Isolation runner",
        timeZone = "Africa/Johannesburg",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    };

    private static readonly object ComradesPlan = new
    {
        raceSlug = "comrades-2027",
        goalTime = "10:30:00",
        runDays = new[] { "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 40,
    };

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private async Task<HttpClient> NewRunner()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), Profile)).EnsureSuccessStatusCode();
        return client;
    }

    private static async Task<Guid> SavePlan(HttpClient client)
    {
        var response = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = ComradesPlan });
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Another_runner_cannot_read_or_use_a_plan_by_its_id()
    {
        var owner = await NewRunner();
        var planId = await SavePlan(owner);
        var stranger = await NewRunner();

        foreach (var path in new[] { "", "/progress", "/insights", "/strava-completions", "/coach/proposal" })
        {
            var response = await stranger.GetAsync(Url($"/api/v1/me/plans/{planId}{path}"));
            response.StatusCode.ShouldBe(HttpStatusCode.NotFound, $"GET /me/plans/{{id}}{path} as another runner");
        }

        var coach = await stranger.PostAsJsonAsync(Url($"/api/v1/me/plans/{planId}/coach"), new { });
        coach.StatusCode.ShouldBe(HttpStatusCode.NotFound);

        var theirList = await stranger.GetStringAsync(Url("/api/v1/me/plans"));
        theirList.ShouldNotContain(planId.ToString());

        // The owner still has it, unchanged by the attempts.
        (await owner.GetAsync(Url($"/api/v1/me/plans/{planId}"))).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Every_runner_endpoint_turns_away_a_caller_who_is_not_signed_in()
    {
        var endpoints = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText is { } raw && raw.Contains("/me", StringComparison.Ordinal))
            .ToList();
        endpoints.Count.ShouldBeGreaterThan(20);

        using var anonymous = factory.CreateClient();
        var allowed = new List<string>();
        foreach (var endpoint in endpoints)
        {
            var path = "/" + string.Join('/', endpoint.RoutePattern.PathSegments.Select(Segment));
            foreach (var method in endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["GET"])
            {
                using var request = new HttpRequestMessage(new HttpMethod(method), path);
                if (method is "POST" or "PUT" or "PATCH") request.Content = JsonContent.Create(new { });
                var response = await anonymous.SendAsync(request);
                if (response.StatusCode != HttpStatusCode.Unauthorized) allowed.Add($"{method} {path} → {(int)response.StatusCode}");
            }
        }

        allowed.ShouldBeEmpty();
    }

    // Fills a route segment with a value of the right shape: v1 for the version, a fresh id for everything else.
    private static string Segment(RoutePatternPathSegment segment) => string.Concat(segment.Parts.Select(part => part switch
    {
        RoutePatternLiteralPart literal => literal.Content,
        RoutePatternSeparatorPart separator => separator.Content,
        RoutePatternParameterPart { Name: "version" } => "1",
        RoutePatternParameterPart parameter when parameter.ParameterPolicies.Any(p => p.Content is "int" or "long") => "1",
        RoutePatternParameterPart parameter when parameter.ParameterPolicies.Any(p => p.Content == "datetime") => "2026-11-24",
        RoutePatternParameterPart => Guid.NewGuid().ToString(),
        _ => "",
    }));
}
