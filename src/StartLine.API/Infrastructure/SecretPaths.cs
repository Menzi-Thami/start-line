using System.Text.RegularExpressions;

namespace StartLine.API.Infrastructure;

/// <summary>
/// Routes that authenticate by an unguessable path segment: the Strava webhook and the personal calendar feed. Keep the
/// secret out of traces: the raw url.path would otherwise record it, and a trace backend is one more place it could leak from.
/// </summary>
internal static partial class SecretPaths
{
    public static void Redact(System.Diagnostics.Activity activity, HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(activity);
        ArgumentNullException.ThrowIfNull(request);
        var redacted = request.Path.Value switch
        {
            { } path when path.Contains("/webhooks/strava/", StringComparison.OrdinalIgnoreCase) => "/api/v1/webhooks/strava/{secret}",
            { } path when CalendarFeed().IsMatch(path) => "/api/v1/calendar/{token}.ics",
            _ => null,
        };
        if (redacted is not null)
        {
            activity.SetTag("url.path", redacted);
            activity.SetTag("url.full", null);
        }
    }

    // Only the anonymous feed: /api/v1/me/calendar (signed in, no secret in the path) is traced as it is.
    [GeneratedRegex("^/api/v[^/]+/calendar/", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex CalendarFeed();
}
