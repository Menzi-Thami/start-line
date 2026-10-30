using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using StartLine.API.Infrastructure;

namespace StartLine.Integration.Tests;

public sealed class SecretPathsTests
{
    private static Activity Traced(string path, string query = "")
    {
        var activity = new Activity("request");
        activity.SetTag("url.path", path);
        if (query.Length > 0)
        {
            activity.SetTag("url.query", query.TrimStart('?'));
        }

        activity.SetTag("url.full", $"https://api.taperday.run{path}{query}");
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Request.QueryString = new QueryString(query.Length > 0 ? query : null);
        SecretPaths.Redact(activity, context.Request);
        return activity;
    }

    [Theory]
    [InlineData("/api/v1/calendar/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG.ics", "/api/v1/calendar/{token}.ics")]
    [InlineData("/api/v1/webhooks/strava/hook-secret-for-tests-0123456789", "/api/v1/webhooks/strava/{secret}")]
    public void A_secret_in_the_path_never_reaches_a_trace(string path, string recorded)
    {
        var activity = Traced(path);

        activity.GetTagItem("url.path").ShouldBe(recorded);
        activity.GetTagItem("url.full").ShouldBeNull();
    }

    [Fact]
    public void An_unsubscribe_key_in_the_query_never_reaches_a_trace()
    {
        var activity = Traced("/api/v1/unsubscribe", "?t=CfDJ8-secret-unsubscribe-key");

        activity.GetTagItem("url.path").ShouldBe("/api/v1/unsubscribe");
        activity.GetTagItem("url.query").ShouldBeNull();
        activity.GetTagItem("url.full").ShouldBeNull();
    }

    [Theory]
    [InlineData("/api/v1/me/calendar")]
    [InlineData("/api/v1/me/calendar/reset")]
    [InlineData("/api/v1/plans/calendar.ics")]
    public void Paths_without_a_secret_are_traced_as_they_are(string path) =>
        Traced(path).GetTagItem("url.path").ShouldBe(path);
}
