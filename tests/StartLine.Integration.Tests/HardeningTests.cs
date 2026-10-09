using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace StartLine.Integration.Tests;

public sealed class HardeningTests
{
    private static readonly object PlanRequest = new
    {
        raceSlug = "comrades-2027",
        goalTime = "10:30:00",
        runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
    };

    private static async Task<HttpResponseMessage> PostPlan(HttpClient client, string? forwardedFor = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/api/v1/plans", UriKind.Relative))
        {
            Content = JsonContent.Create(PlanRequest),
        };
        if (forwardedFor is not null)
        {
            request.Headers.Add("X-Forwarded-For", forwardedFor);
        }

        return await client.SendAsync(request);
    }

    private static async Task ExhaustPlanLimit(HttpClient client, string? forwardedFor)
    {
        for (var i = 0; i < 30; i++)
        {
            (await PostPlan(client, forwardedFor)).StatusCode.ShouldBe(HttpStatusCode.OK);
        }
    }

    [Fact]
    public async Task A_client_cannot_dodge_the_rate_limit_by_forging_X_Forwarded_For()
    {
        using var factory = new StartLineApiFactory();
        var client = factory.CreateClient();

        await ExhaustPlanLimit(client, forwardedFor: "203.0.113.1");
        var forged = await PostPlan(client, forwardedFor: "203.0.113.99");

        forged.StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);
    }

    [Fact]
    public async Task Behind_a_trusted_proxy_each_real_client_gets_its_own_limit()
    {
        using var factory = new BehindTrustedProxyFactory();
        var client = factory.CreateClient();

        await ExhaustPlanLimit(client, forwardedFor: "203.0.113.1");
        (await PostPlan(client, forwardedFor: "203.0.113.1")).StatusCode.ShouldBe(HttpStatusCode.TooManyRequests);

        var someoneElse = await PostPlan(client, forwardedFor: "203.0.113.2");
        someoneElse.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Every_response_carries_a_trace_id()
    {
        using var factory = new StartLineApiFactory();
        var client = factory.CreateClient();

        var ok = await client.GetAsync(new Uri("/api/v1/races", UriKind.Relative));
        var notFound = await client.GetAsync(new Uri("/api/v1/nothing-here", UriKind.Relative));

        ok.Headers.GetValues("X-Trace-Id").Single().ShouldNotBeNullOrWhiteSpace();
        notFound.Headers.Contains("X-Trace-Id").ShouldBeTrue();
    }

    [Fact]
    public async Task An_oversized_plan_request_is_refused()
    {
        using var factory = new StartLineApiFactory();
        var client = factory.CreateClient();
        var padding = new string('x', 20 * 1024);
        using var body = new StringContent($"{{ \"raceName\": \"{padding}\" }}", Encoding.UTF8, "application/json");

        var response = await client.PostAsync(new Uri("/api/v1/plans", UriKind.Relative), body);

        ((int)response.StatusCode).ShouldBeOneOf(400, 413);
    }

    [Fact]
    public async Task A_run_days_list_longer_than_a_week_is_rejected_before_any_work()
    {
        using var factory = new StartLineApiFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), new
        {
            raceSlug = "comrades-2027",
            goalTime = "10:30:00",
            runDays = Enumerable.Repeat("Sunday", 500).ToArray(),
            longRunDay = "Sunday",
        });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }
}
