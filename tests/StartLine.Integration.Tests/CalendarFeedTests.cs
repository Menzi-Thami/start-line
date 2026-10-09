using System.Net;
using System.Text;

namespace StartLine.Integration.Tests;

public sealed class CalendarFeedTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private const string ComradesQuery =
        "raceSlug=comrades-2027&goalTime=10:30:00&runDays=Tuesday&runDays=Thursday&runDays=Saturday&runDays=Sunday&longRunDay=Sunday&planFrom=2026-10-08";

    private readonly HttpClient _client = factory.CreateClient();

    private Task<HttpResponseMessage> Feed(string query) =>
        _client.GetAsync(new Uri($"/api/v1/plans/calendar.ics?{query}", UriKind.Relative));

    [Fact]
    public async Task Serves_the_plan_as_a_calendar_anyone_can_subscribe_to()
    {
        // No sign-in headers: calendar apps can't sign in.
        var response = await Feed(ComradesQuery);

        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.ShouldBe("text/calendar");
        response.Headers.CacheControl!.Public.ShouldBeTrue();
        var ics = await response.Content.ReadAsStringAsync();
        ics.ShouldStartWith("BEGIN:VCALENDAR\r\n");
        ics.ShouldEndWith("END:VCALENDAR\r\n");
        ics.ShouldContain("X-WR-CALNAME:Taperday: Comrades Marathon\r\n");
        ics.ShouldContain("REFRESH-INTERVAL;VALUE=DURATION:P1D\r\n");
    }

    [Fact]
    public async Task Puts_every_session_in_with_race_day_last()
    {
        var ics = await (await Feed(ComradesQuery)).Content.ReadAsStringAsync();
        var unfolded = ics.Replace("\r\n ", "", StringComparison.Ordinal);

        var events = unfolded.Split("BEGIN:VEVENT").Skip(1).ToList();
        events.Count.ShouldBeGreaterThan(50);
        events[^1].ShouldContain("DTSTART;VALUE=DATE:20270613");
        events[^1].ShouldContain("DTEND;VALUE=DATE:20270614");
        unfolded.ShouldContain("/km");
    }

    [Fact]
    public async Task Shows_distances_and_paces_in_miles_when_asked()
    {
        var ics = await (await Feed(ComradesQuery + "&units=mi")).Content.ReadAsStringAsync();
        var unfolded = ics.Replace("\r\n ", "", StringComparison.Ordinal);

        unfolded.ShouldContain("/mi");
        unfolded.ShouldNotContain("/km");
    }

    [Fact]
    public async Task Keeps_every_line_within_the_75_octet_limit()
    {
        var ics = await (await Feed(ComradesQuery)).Content.ReadAsStringAsync();

        ics.Split("\r\n").ShouldAllBe(line => Encoding.UTF8.GetByteCount(line) <= 75);
    }

    [Fact]
    public async Task Turns_down_a_plan_that_isnt_valid_with_the_usual_problem_details()
    {
        var response = await Feed("raceSlug=comrades-2027&goalTime=10:30:00&runDays=Sunday&longRunDay=Sunday&planFrom=2026-10-08");

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await response.Content.ReadAsStringAsync()).ShouldContain("RunDays");
    }

    [Fact]
    public async Task Says_not_found_for_a_race_that_doesnt_exist()
    {
        var response = await Feed(ComradesQuery.Replace("comrades-2027", "no-such-race", StringComparison.Ordinal));

        response.StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }
}
