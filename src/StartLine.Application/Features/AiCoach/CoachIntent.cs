using System.Globalization;
using System.Text.RegularExpressions;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.AiCoach;

/// <summary>
/// What a question asks for. <see cref="Answer"/>: a question to answer in words. <see cref="AdjustSession"/>: an exact change to
/// one run, checked by <see cref="SessionAdjuster"/>. <see cref="WeeklyReview"/>: how the coming week should change, which the
/// weekly coach answers. <see cref="Clarify"/>: one short question back, when the ask could mean two things.
/// </summary>
public enum CoachIntentKind { Answer, AdjustSession, WeeklyReview, Clarify }

/// <summary>
/// A question turned into something Taperday's rules can check. Never executable on its own: an adjustment is only ever previewed,
/// and the reply is shown as words. <see cref="Date"/> may be null for "my next run".
/// </summary>
public sealed record CoachIntent(CoachIntentKind Kind, string? Reply = null, AdjustmentKind? Adjustment = null, DateOnly? Date = null,
    int? Minutes = null, double? Km = null, int? PaceSecondsPerKm = null);

/// <summary>
/// Reads a runner's question with plain rules: "I only have 35 minutes tomorrow", "make Saturday 18 km", "run my easy at 6:15/km",
/// "how should next week change?". The coach's understanding when the AI is off, not agreed to, over budget or unavailable, and
/// deliberately narrow: what it can't read becomes a plain answer, never a guess at a change.
/// </summary>
public static partial class RulesIntentReader
{
    public const double KmPerMile = 1.609344;

    /// <param name="hasRun">Whether a day has a run the coach can change; lets a named weekday mean the one with a run.</param>
    public static CoachIntent Read(string question, DateOnly today, Func<DateOnly, bool>? hasRun = null)
    {
        ArgumentNullException.ThrowIfNull(question);
        var text = question.ToLowerInvariant();
        var date = DateIn(text, today, hasRun);

        var pace = PaceIn(text);
        var minutes = MinutesIn(text);
        var km = KmIn(text);
        if (pace is not null)
            return new(CoachIntentKind.AdjustSession, Adjustment: AdjustmentKind.Pace, Date: date, PaceSecondsPerKm: pace);
        if (minutes is not null && km is not null)
            return new(CoachIntentKind.Clarify, "Do you want to change how long the run is, or how far? Ask with just one of them, like “35 minutes” or “6 km”.");
        if (minutes is not null)
            return new(CoachIntentKind.AdjustSession, Adjustment: AdjustmentKind.Duration, Date: date, Minutes: minutes);
        if (km is not null)
            return new(CoachIntentKind.AdjustSession, Adjustment: AdjustmentKind.Distance, Date: date, Km: km);
        if (WeekWords().IsMatch(text))
            return new(CoachIntentKind.WeeklyReview);
        return new(CoachIntentKind.Answer);
    }

    /// <summary>
    /// "today", "tonight", "tomorrow" or a weekday. A weekday is the next one from today (today included), or the one a week
    /// later when only that one has a run: asked on a Saturday before the plan starts, "make Sunday 18 km" means the long run
    /// a week on, not tomorrow's rest day. Null when no day is named.
    /// </summary>
    public static DateOnly? DateIn(string text, DateOnly today, Func<DateOnly, bool>? hasRun = null)
    {
        ArgumentNullException.ThrowIfNull(text);
        if (TodayWords().IsMatch(text)) return today;
        if (text.Contains("tomorrow", StringComparison.Ordinal)) return today.AddDays(1);
        var day = Weekday().Match(text);
        if (!day.Success) return null;
        var wanted = Enum.Parse<DayOfWeek>(day.Groups[1].Value, ignoreCase: true);
        var next = today.AddDays(((int)wanted - (int)today.DayOfWeek + 7) % 7);
        return hasRun is not null && !hasRun(next) && hasRun(next.AddDays(7)) ? next.AddDays(7) : next;
    }

    /// <summary>A pace with its unit: "6:15/km", "6.15 per km", "9:30 min/mile". Per-mile paces become per-km. Null without a unit.</summary>
    public static int? PaceIn(string text)
    {
        var match = PacePattern().Match(text);
        if (!match.Success) return null;
        var seconds = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) * 60 + int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        if (match.Groups[3].Value.StartsWith('m')) seconds = (int)Math.Round(seconds / KmPerMile);
        return seconds;
    }

    /// <summary>"35 minutes", "45 min", "1 hour", "1h30", "an hour", "half an hour". Null when no time is named.</summary>
    public static int? MinutesIn(string text)
    {
        if (text.Contains("half an hour", StringComparison.Ordinal)) return 30;
        var hm = HoursAndMinutes().Match(text);
        if (hm.Success)
            return (int)Math.Round(double.Parse(hm.Groups[1].Value.Replace(',', '.'), CultureInfo.InvariantCulture) * 60)
                + (hm.Groups[2].Success ? int.Parse(hm.Groups[2].Value, CultureInfo.InvariantCulture) : 0);
        if (AnHour().IsMatch(text)) return 60;
        var m = MinutesPattern().Match(text);
        return m.Success ? int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : null;
    }

    /// <summary>"10 km", "10k", "8.5 kilometres", "6 miles". Miles become km. Null when no distance is named.</summary>
    public static double? KmIn(string text)
    {
        var km = KmPattern().Match(text);
        if (km.Success) return double.Parse(km.Groups[1].Value.Replace(',', '.'), CultureInfo.InvariantCulture);
        var miles = MilesPattern().Match(text);
        return miles.Success ? Math.Round(double.Parse(miles.Groups[1].Value.Replace(',', '.'), CultureInfo.InvariantCulture) * KmPerMile, 2) : null;
    }

    [GeneratedRegex(@"\b(today|tonight|this (morning|afternoon|evening))\b")]
    private static partial Regex TodayWords();

    [GeneratedRegex(@"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b")]
    private static partial Regex Weekday();

    [GeneratedRegex(@"\b(\d{1,2})[:.](\d{2})\s*(?:min\s*)?(?:/|per|a)\s*(km|k\b|kilomet|mile|mi\b)")]
    private static partial Regex PacePattern();

    [GeneratedRegex(@"\b(\d{1,2}(?:[.,]\d)?)\s*(?:h|hr|hrs|hour|hours)(?=\b|\d)(?:\s*(?:and\s*)?(\d{1,2})\s*(?:m|min|mins|minutes)?\b)?")]
    private static partial Regex HoursAndMinutes();

    [GeneratedRegex(@"\ban hour\b")]
    private static partial Regex AnHour();

    [GeneratedRegex(@"\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b")]
    private static partial Regex MinutesPattern();

    [GeneratedRegex(@"\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:km|k|kms|kilometres|kilometers|kilometre|kilometer)\b")]
    private static partial Regex KmPattern();

    [GeneratedRegex(@"\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mi|mile|miles)\b")]
    private static partial Regex MilesPattern();

    [GeneratedRegex(@"\b(next week|this week|coming week|weekly|week review|rest of (the|my) (week|plan)|remaining weeks|adapt|adjust my plan|change my plan|progress)\b")]
    private static partial Regex WeekWords();
}

/// <summary>What the coach sends a language model: the question and the allowed context, already reduced and serialised.</summary>
public sealed record CoachModelRequest(string Question, DateOnly Today, string ContextJson);

/// <summary>The model's reading of the question, as a <see cref="CoachIntent"/>, and what the call used.</summary>
public sealed record CoachModelReply(CoachIntent Intent, long InputTokens, long OutputTokens);

/// <summary>
/// A language model that turns a question into a <see cref="CoachIntent"/> and short words. Its output is untrusted: every field
/// is checked again, and only the rules can make a change. Implemented in Infrastructure; tests use a fake.
/// </summary>
public interface ICoachLanguageModel
{
    /// <summary>Whether a provider and key are configured. False means the coach answers from its rules alone.</summary>
    bool IsConfigured { get; }

    /// <summary>The provider's price for this model, so usage can be budgeted before the bill arrives.</summary>
    long CostMicroUsd(long inputTokens, long outputTokens);

    /// <exception cref="CoachModelUnavailableException">The provider failed, timed out, refused or answered with something unusable.</exception>
    Task<CoachModelReply> InterpretAsync(CoachModelRequest request, CancellationToken cancellationToken);
}

/// <summary>No language model: the coach answers from its rules. The default until Infrastructure registers a provider.</summary>
internal sealed class NoCoachLanguageModel : ICoachLanguageModel
{
    public bool IsConfigured => false;

    public long CostMicroUsd(long inputTokens, long outputTokens) => 0;

    public Task<CoachModelReply> InterpretAsync(CoachModelRequest request, CancellationToken cancellationToken) =>
        throw new CoachModelUnavailableException("not configured");
}

/// <summary>The model couldn't give a usable answer. The coach falls back to its rules; the reason is for logs only.</summary>
public sealed class CoachModelUnavailableException : Exception
{
    public CoachModelUnavailableException()
    {
    }

    public CoachModelUnavailableException(string message)
        : base(message)
    {
    }

    public CoachModelUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    /// <summary>Tokens the failed call still used and is billed for, when the provider said.</summary>
    public long InputTokens { get; init; }

    public long OutputTokens { get; init; }
}

/// <summary>
/// The AI coach's switches and limits, from configuration (<c>AiCoach</c> section). Off unless <see cref="Enabled"/>. The limits
/// are durable (counted in the database), and fail closed: past them, the coach answers from its rules alone.
/// </summary>
public sealed record AiCoachSettings(
    bool Enabled = false,
    int DailyCallsPerRunner = 6,
    decimal MonthlyBudgetUsd = 5m,
    bool McpEnabled = false);
