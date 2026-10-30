using System.Text.RegularExpressions;

namespace StartLine.API.Infrastructure;

/// <summary>
/// Routes that authenticate by an unguessable secret in the address: the Strava webhook and the personal calendar feed
/// (in the path), and an email's one-click unsubscribe (in the query, as the List-Unsubscribe header has to give it).
/// Keep the secret out of traces: the raw url.path, url.query or url.full would otherwise record it, and a trace backend
/// is one more place it could leak from.
/// </summary>
internal static partial class SecretPaths
{
    public static void Redact(System.Diagnostics.Activity activity, HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(activity);
        ArgumentNullException.ThrowIfNull(request);
        var path = request.Path.Value;
        var redacted = path switch
        {
            not null when path.Contains("/webhooks/strava/", StringComparison.OrdinalIgnoreCase) => "/api/v1/webhooks/strava/{secret}",
            not null when CalendarFeed().IsMatch(path) => "/api/v1/calendar/{token}.ics",
            _ => null,
        };
        if (redacted is not null)
        {
            activity.SetTag("url.path", redacted);
            activity.SetTag("url.full", null);
        }
        else if (path is not null && Unsubscribe().IsMatch(path))
        {
            // The path is harmless; the key is the query. Drop it whole rather than trust the instrumentation's own redaction.
            activity.SetTag("url.query", null);
            activity.SetTag("url.full", null);
        }
    }

    // Only the anonymous feed: /api/v1/me/calendar (signed in, no secret in the path) is traced as it is.
    [GeneratedRegex("^/api/v[^/]+/calendar/", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex CalendarFeed();

    [GeneratedRegex("^/api/v[^/]+/unsubscribe/?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Unsubscribe();
}
