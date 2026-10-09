using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace StartLine.Integration.Tests;

public sealed class ApiTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private static object ComradesPlan(string slug = "comrades-2027", string goal = "10:30:00") => new
    {
        raceSlug = slug,
        goalTime = goal,
        runDays = new[] { "Tuesday", "Wednesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 40,
    };

    private static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task Lists_upcoming_races_from_configuration_soonest_first()
    {
        var response = await _client.GetAsync(new Uri("/api/v1/races", UriKind.Relative));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var slugs = (await Json(response)).EnumerateArray().Select(r => r.GetProperty("slug").GetString()).ToList();
        slugs.ShouldBe(["two-oceans-ultra-2027", "cape-town-marathon-2027", "comrades-2027", "cape100-2027"]);
    }

    [Fact]
    public async Task Builds_a_plan_for_a_catalogue_race()
    {
        var response = await _client.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), ComradesPlan());

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var plan = await Json(response);
        plan.GetProperty("race").GetProperty("name").GetString().ShouldBe("Comrades Marathon");
        plan.GetProperty("category").GetString().ShouldBe("LongUltra");
        plan.GetProperty("goalTime").GetString().ShouldBe("10:30:00");
        plan.GetProperty("paces").GetArrayLength().ShouldBe(6);

        var lastSession = plan.GetProperty("weeks").EnumerateArray().Last().GetProperty("sessions").EnumerateArray().Last();
        lastSession.GetProperty("type").GetString().ShouldBe("Race");
        lastSession.GetProperty("date").GetString().ShouldBe("2027-06-13");
    }

    [Fact]
    public async Task Builds_a_plan_for_any_race()
    {
        var response = await _client.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), new
        {
            raceName = "Parkrun PB",
            distanceKm = 5,
            raceDate = "2027-01-16",
            goalTime = "00:24:30",
            runDays = new[] { "Monday", "Wednesday", "Friday", "Saturday" },
            longRunDay = "Saturday",
            experience = "New",
            strengthDays = new[] { "Tuesday" },
        });

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Json(response)).GetProperty("race").GetProperty("slug").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task An_invalid_plan_request_returns_field_errors_as_validation_problem_details()
    {
        var response = await _client.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), new
        {
            distanceKm = 42.2,
            raceDate = "2027-05-01",
            goalTime = "00:03:00",
            runDays = new[] { "Sunday" },
            longRunDay = "Sunday",
        });

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentType!.MediaType.ShouldBe("application/problem+json");
        var problem = await Json(response);
        problem.GetProperty("code").GetString().ShouldBe("validation_failed");
        var fields = problem.GetProperty("errors").EnumerateObject().Select(p => p.Name).ToList();
        fields.ShouldBe(["GoalTime", "RunDays"], ignoreOrder: true);
        problem.TryGetProperty("traceId", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task Malformed_json_gets_the_same_error_code()
    {
        using var body = new StringContent("{ \"runDays\": \"lots\" }", Encoding.UTF8, "application/json");

        var response = await _client.PostAsync(new Uri("/api/v1/plans", UriKind.Relative), body);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await Json(response)).GetProperty("code").GetString().ShouldBe("validation_failed");
    }

    [Fact]
    public async Task Numbers_sent_as_strings_are_rejected()
    {
        // Strict number handling keeps input tight and the published OpenAPI schema honest (number, not number-or-string).
        using var body = new StringContent(
            "{ \"distanceKm\": \"5\", \"raceDate\": \"2027-01-16\", \"goalTime\": \"00:24:30\", \"runDays\": [\"Tuesday\", \"Thursday\", \"Sunday\"], \"longRunDay\": \"Sunday\" }",
            Encoding.UTF8,
            "application/json");

        var response = await _client.PostAsync(new Uri("/api/v1/plans", UriKind.Relative), body);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task An_unknown_race_is_a_404_problem()
    {
        var response = await _client.PostAsJsonAsync(new Uri("/api/v1/plans", UriKind.Relative), ComradesPlan(slug: "no-such-race"));

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await Json(response)).GetProperty("code").GetString().ShouldBe("not_found");
    }

    [Fact]
    public async Task Predicts_a_finish_time()
    {
        var response = await _client.GetAsync(new Uri("/api/v1/predictions?fromKm=10&time=00:50:00&toKm=42.195", UriKind.Relative));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        TimeSpan.Parse((await Json(response)).GetProperty("predictedTime").GetString()!, System.Globalization.CultureInfo.InvariantCulture)
            .TotalMinutes.ShouldBe(230, tolerance: 1);
    }

    [Theory]
    [InlineData("/health/live")]
    [InlineData("/health/ready")]
    public async Task Health_checks_are_green(string path)
    {
        var response = await _client.GetAsync(new Uri(path, UriKind.Relative));

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Responses_carry_security_headers_and_the_api_version()
    {
        var response = await _client.GetAsync(new Uri("/api/v1/races", UriKind.Relative));

        response.Headers.GetValues("X-Content-Type-Options").ShouldBe(["nosniff"]);
        response.Headers.GetValues("X-Frame-Options").ShouldBe(["DENY"]);
        response.Headers.Contains("Content-Security-Policy").ShouldBeTrue();
        response.Headers.GetValues("api-supported-versions").ShouldBe(["1.0"]);
    }

    [Fact]
    public async Task An_unsupported_api_version_is_rejected()
    {
        var response = await _client.GetAsync(new Uri("/api/v2/races", UriKind.Relative));

        ((int)response.StatusCode).ShouldBeInRange(400, 404);
    }
}
