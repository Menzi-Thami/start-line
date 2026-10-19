using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Features.Sync;
using StartLine.Infrastructure.Sync;

namespace StartLine.Integration.Tests;

/// <summary>The real Strava client against canned responses: what it asks for, what it reads, how it fails.</summary>
public sealed class HttpStravaApiTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 6, 7, 0, TimeSpan.Zero);

    private sealed class Canned(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];

        /// <summary>Request bodies, read as they were sent: the client disposes them afterwards.</summary>
        public List<string> Bodies { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            Bodies.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken));
            return respond(request);
        }
    }

    private static HttpResponseMessage Ok(string json, string? readUsage = null)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        if (readUsage is not null)
        {
            response.Headers.Add("X-ReadRateLimit-Usage", readUsage);
            response.Headers.Add("X-ReadRateLimit-Limit", "100,1000");
        }

        return response;
    }

    private static (HttpStravaApi Api, Canned Handler, StravaRateGate Gate) Api(Func<HttpRequestMessage, HttpResponseMessage> respond)
    {
        var handler = new Canned(respond);
        var gate = new StravaRateGate(new FakeTimeProvider(Now));
        var options = Options.Create(new StravaOptions { ClientId = "123", ClientSecret = "shh", RedirectUri = new Uri("https://taperday.test/?strava=callback") });
        return (new HttpStravaApi(new HttpClient(handler), options, gate), handler, gate);
    }

    [Fact]
    public void The_authorize_url_asks_for_runs_including_private_ones_and_carries_the_state()
    {
        var (api, _, _) = Api(_ => Ok("{}"));

        var url = api.AuthorizeUrl("st&te", new Uri("https://taperday.test/?strava=callback")).ToString();

        url.ShouldStartWith("https://www.strava.com/oauth/authorize?client_id=123&response_type=code");
        url.ShouldContain("scope=read%2Cactivity%3Aread_all");
        url.ShouldContain("state=st%26te");
        url.ShouldContain("redirect_uri=https%3A%2F%2Ftaperday.test%2F%3Fstrava%3Dcallback");
    }

    [Fact]
    public async Task Streams_are_asked_for_without_location_and_read_by_type()
    {
        var (api, handler, _) = Api(_ => Ok("""{"time":{"data":[0,1,2]},"distance":{"data":[0,3.1,6.2]},"heartrate":{"data":[140,141,142]}}"""));

        var streams = await api.GetStreamsAsync("token", 42, CancellationToken.None);

        handler.Requests[0].RequestUri!.ToString().ShouldBe("https://www.strava.com/api/v3/activities/42/streams?keys=time,distance,altitude,heartrate&key_by_type=true");
        handler.Requests[0].RequestUri!.ToString().ShouldNotContain("latlng");
        handler.Requests[0].Headers.Authorization!.ToString().ShouldBe("Bearer token");
        streams!.Time.ShouldBe([0, 1, 2]);
        streams.Distance.ShouldBe([0, 3.1, 6.2]);
        streams.HeartRate.ShouldBe([140, 141, 142]);
        streams.Altitude.ShouldBeNull();
    }

    [Fact]
    public async Task An_activity_is_read_from_strava_json()
    {
        var (api, _, _) = Api(_ => Ok("""
            {"id":42,"athlete":{"id":7},"sport_type":"TrailRun","start_date":"2026-10-18T04:30:00Z","trainer":false,"manual":false,
             "total_elevation_gain":312.5,"average_heartrate":151.2,"max_heartrate":177.0,"calories":820.4,"device_name":"Garmin fenix 8",
             "map":{"summary_polyline":"ignored"}}
            """));

        var activity = await api.GetActivityAsync("token", 42, CancellationToken.None);

        activity.ShouldBe(new StravaActivity(42, 7, "TrailRun", new DateTimeOffset(2026, 10, 18, 4, 30, 0, TimeSpan.Zero), false, false, 312.5, 151.2, 177.0, 820.4, "Garmin fenix 8"));
    }

    [Fact]
    public async Task A_run_strava_no_longer_has_reads_as_null()
    {
        var (api, _, _) = Api(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        (await api.GetActivityAsync("token", 42, CancellationToken.None)).ShouldBeNull();
    }

    [Fact]
    public async Task Every_response_reports_strava_rate_usage_to_the_gate()
    {
        var (api, _, gate) = Api(_ => Ok("[]", readUsage: "91,140"));

        await api.ListActivitiesAsync("token", Now.AddDays(-42), 1, CancellationToken.None);

        gate.LastUsage.ShouldBe(new Domain.Sync.ApiUsage(91, 100, 140, 1000));
        gate.BlockedUntil().ShouldBe(new DateTimeOffset(2026, 10, 19, 6, 15, 0, TimeSpan.Zero));
    }

    [Fact]
    public async Task A_429_is_a_typed_wait_until_the_next_window()
    {
        var (api, _, _) = Api(_ => new HttpResponseMessage(HttpStatusCode.TooManyRequests));

        var e = await Should.ThrowAsync<StravaRateLimitedException>(() => api.GetActivityAsync("token", 42, CancellationToken.None));

        e.RetryAt.ShouldBe(new DateTimeOffset(2026, 10, 19, 6, 15, 0, TimeSpan.Zero));
    }

    [Fact]
    public async Task Refused_tokens_and_server_errors_are_told_apart()
    {
        var (unauthorized, _, _) = Api(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized));
        var (badRefresh, _, _) = Api(_ => new HttpResponseMessage(HttpStatusCode.BadRequest));
        var (down, _, _) = Api(_ => new HttpResponseMessage(HttpStatusCode.BadGateway) { Content = new StringContent("upstream") });

        await Should.ThrowAsync<StravaUnauthorizedException>(() => unauthorized.GetActivityAsync("token", 42, CancellationToken.None));
        await Should.ThrowAsync<StravaUnauthorizedException>(() => badRefresh.RefreshAsync("old", CancellationToken.None));
        await Should.ThrowAsync<StravaUnavailableException>(() => down.GetActivityAsync("token", 42, CancellationToken.None));
    }

    [Fact]
    public async Task The_code_exchange_posts_the_app_credentials_and_reads_the_athlete()
    {
        var (api, handler, _) = Api(_ => Ok("""{"access_token":"a1","refresh_token":"r1","expires_at":1792400000,"athlete":{"id":7}}"""));

        var grant = await api.ExchangeCodeAsync("the-code", CancellationToken.None);

        var form = handler.Bodies[0];
        handler.Requests[0].RequestUri!.ToString().ShouldBe("https://www.strava.com/oauth/token");
        form.ShouldContain("code=the-code");
        form.ShouldContain("grant_type=authorization_code");
        form.ShouldContain("client_id=123");
        grant.ShouldBe(new StravaTokenGrant("a1", "r1", DateTimeOffset.FromUnixTimeSeconds(1792400000), 7));
    }
}
