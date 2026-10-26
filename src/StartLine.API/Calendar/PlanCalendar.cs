using System.Globalization;
using System.Text;
using StartLine.Application.Features.Plans;

namespace StartLine.API.Calendar;

/// <summary>
/// A plan as an iCalendar feed (RFC 5545): one all-day event per session. Calendar apps subscribe to it by URL,
/// so the plan sits in the runner's own calendar. Mirrors the client's one-off download (client/src/lib/ics.ts):
/// same titles, descriptions and event ids.
/// </summary>
internal static class PlanCalendar
{
    public const string ContentType = "text/calendar";
    private const double KmPerMile = 1.609344;
    private const int MaxLineOctets = 75;

    public static string Build(TrainingPlanDto plan, bool miles, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(plan);

        var unit = miles ? "mi" : "km";
        var paces = plan.Paces.ToDictionary(p => p.Zone);
        var stamp = now.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var lines = Header($"Taperday: {plan.Race.Name}");

        foreach (var week in plan.Weeks)
        {
            for (var index = 0; index < week.Sessions.Count; index++)
            {
                var session = week.Sessions[index];
                var pace = session.Zone is { } zone && paces.TryGetValue(zone, out var range) ? range : null;
                var numbers = new[]
                {
                    session.DistanceKm > 0 ? FormatDistance(session.DistanceKm, miles, unit) : null,
                    pace is null ? null : FormatPaceRange(pace.FastestSecondsPerKm, pace.SlowestSecondsPerKm, miles, unit),
                }.OfType<string>().ToList();
                var summary = numbers.Count > 0 ? $"{session.Title} · {string.Join(" at ", numbers)}" : session.Title;
                var exercises = session.Exercises.Count == 0
                    ? ""
                    : "\n\n" + string.Join("\n", session.Exercises.Select((e, i) => $"{i + 1}. {e.Summary}"));
                var description = $"{session.Detail}{exercises}\n\nWhy: {session.Purpose}\n\nWeek {week.Number} of {plan.Weeks.Count} for {plan.Race.Name}.";

                lines.Add("BEGIN:VEVENT");
                lines.Add($"UID:{Compact(session.Date)}-{index}-{session.Type}@taperday.run");
                lines.Add($"DTSTAMP:{stamp}");
                lines.Add($"DTSTART;VALUE=DATE:{Compact(session.Date)}");
                lines.Add($"DTEND;VALUE=DATE:{Compact(session.Date.AddDays(1))}");
                lines.Add($"SUMMARY:{Escape(summary)}");
                lines.Add($"DESCRIPTION:{Escape(description)}");
                lines.Add("TRANSP:TRANSPARENT");
                lines.Add("END:VEVENT");
            }
        }

        return Finish(lines);
    }

    /// <summary>
    /// A valid calendar with no runs, for a personal feed whose runner has no current plan: the subscription stays, and
    /// fills in again when they make one.
    /// </summary>
    public static string Empty() => Finish(Header("Taperday"));

    private static List<string> Header(string name) =>
    [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Taperday//Training plan//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        $"X-WR-CALNAME:{Escape(name)}",
        // How often a subscribed calendar should check for changes. Apple and Outlook honour these; Google
        // refreshes on its own schedule.
        "REFRESH-INTERVAL;VALUE=DURATION:P1D",
        "X-PUBLISHED-TTL:P1D",
    ];

    private static string Finish(List<string> lines)
    {
        lines.Add("END:VCALENDAR");

        var ics = new StringBuilder();
        foreach (var line in lines)
        {
            ics.Append(Fold(line)).Append("\r\n");
        }

        return ics.ToString();
    }

    private static string Compact(DateOnly date) => date.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    // RFC 5545 text escaping: backslash first, then the separators.
    private static string Escape(string text) => text
        .Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace(";", "\\;", StringComparison.Ordinal)
        .Replace(",", "\\,", StringComparison.Ordinal)
        .Replace("\r\n", "\\n", StringComparison.Ordinal)
        .Replace("\n", "\\n", StringComparison.Ordinal);

    // Lines longer than 75 octets continue on the next line after a single space, never splitting a character.
    private static string Fold(string line)
    {
        if (Encoding.UTF8.GetByteCount(line) <= MaxLineOctets)
        {
            return line;
        }

        var folded = new StringBuilder();
        var octets = 0;
        var limit = MaxLineOctets;
        var position = 0;
        while (position < line.Length)
        {
            var length = char.IsSurrogatePair(line, position) ? 2 : 1;
            var size = Encoding.UTF8.GetByteCount(line.AsSpan(position, length));
            if (octets + size > limit)
            {
                folded.Append("\r\n ");
                octets = 0;
                limit = MaxLineOctets - 1;
            }

            folded.Append(line, position, length);
            octets += size;
            position += length;
        }

        return folded.ToString();
    }

    // "5:41/km". Seconds round first, so 5:59.6 becomes 6:00 rather than 5:60.
    private static string FormatPace(double secondsPerKm, bool miles, string unit)
    {
        var perUnit = (int)Math.Round(miles ? secondsPerKm * KmPerMile : secondsPerKm, MidpointRounding.AwayFromZero);
        return string.Create(CultureInfo.InvariantCulture, $"{perUnit / 60}:{perUnit % 60:00}/{unit}");
    }

    private static string FormatPaceRange(double fastest, double slowest, bool miles, string unit)
    {
        var fast = FormatPace(fastest, miles, unit);
        var slow = FormatPace(slowest, miles, unit);
        return fast == slow ? fast : $"{fast[..^(unit.Length + 1)]}–{slow}";
    }

    private static string FormatDistance(double km, bool miles, string unit)
    {
        var rounded = Math.Round(miles ? km / KmPerMile : km, 1, MidpointRounding.AwayFromZero);
        return string.Create(CultureInfo.InvariantCulture, $"{rounded:0.#} {unit}");
    }
}
