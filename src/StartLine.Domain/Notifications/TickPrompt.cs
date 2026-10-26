using System.Globalization;
using StartLine.Domain.Activities;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Domain.Notifications;

/// <summary>
/// A note that the runner has been asked once whether to tick a planned session, so they're never asked twice. It holds
/// the session (plan, date, type) and nothing else: not the run, its distance, its time or its Strava id, so nothing from
/// Strava is kept in it. It goes with the plan, and is forgotten after <see cref="TickPrompts.KeptFor"/>.
/// </summary>
public sealed class TickPrompt
{
    private TickPrompt()
    {
    }

    public Guid Id { get; private set; }

    public Guid SavedPlanId { get; private set; }

    public DateOnly Date { get; private set; }

    public SessionType SessionType { get; private set; }

    public static TickPrompt For(Guid savedPlanId, DateOnly date, SessionType sessionType)
    {
        if (savedPlanId == Guid.Empty)
        {
            throw new DomainException("A tick prompt belongs to a saved plan.");
        }

        return new TickPrompt { Id = Guid.NewGuid(), SavedPlanId = savedPlanId, Date = date, SessionType = sessionType };
    }
}

/// <summary>What's known when a synced run arrives, beyond the run itself.</summary>
/// <param name="RemindersOn">The runner has reminders on for at least one device.</param>
/// <param name="InPlan">The run's planned session is in the runner's current plan on that day.</param>
/// <param name="CheckedIn">The runner has already checked in on that session.</param>
/// <param name="AlreadyPrompted">They've already been asked about that session.</param>
public sealed record TickPromptFacts(bool RemindersOn, bool InPlan, bool CheckedIn, bool AlreadyPrompted);

/// <summary>
/// "Ran it? Tick it." When a run synced from Strava matches a planned session the runner hasn't checked in on, a push
/// asks them to tick it. The tick is theirs, so it's kept; the synced run isn't. Only ever a question: Taperday never
/// ticks a session for the runner.
/// </summary>
public static class TickPrompts
{
    /// <summary>A run older than this when it arrives is a backfill or a late edit: the runner isn't asked about it.</summary>
    public static readonly TimeSpan MaxRunAge = TimeSpan.FromDays(2);

    /// <summary>
    /// How long the "asked" note is kept after the session's day. Long past <see cref="MaxRunAge"/>, so it's never needed
    /// after this, and no longer than a synced run itself is kept.
    /// </summary>
    public static readonly TimeSpan KeptFor = StravaCache.Lifetime;

    public static bool IsDue(Activity run, TickPromptFacts facts, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(run);
        ArgumentNullException.ThrowIfNull(facts);
        return run.Source == ActivitySource.Strava
            && run.PlannedSession is not null
            && facts is { RemindersOn: true, InPlan: true, CheckedIn: false, AlreadyPrompted: false }
            && now - run.StartedAt <= MaxRunAge;
    }

    /// <summary>The push's title: "Ran Tuesday’s Tempo?".</summary>
    public static string Title(PlannedSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        return $"Ran {SessionName(session)}?";
    }

    /// <summary>
    /// What the push says. With run data allowed (<paramref name="ranKm"/> given): "Strava says you ran 10.2 km this
    /// morning. Tick Tuesday’s Tempo as done?". Without, nothing from the run itself.
    /// </summary>
    /// <param name="localStart">When the run started, in the runner's own time.</param>
    /// <param name="localToday">Today, where the runner is.</param>
    public static string Body(PlannedSession session, double? ranKm, DateTime localStart, DateOnly localToday, Units units)
    {
        ArgumentNullException.ThrowIfNull(session);
        return ranKm is { } km
            ? $"Strava says you ran {Reminders.Distance(km, units)} {When(localStart, localToday)}. Tick {SessionName(session)} as done?"
            : "A run from Strava matches it. Tick it as done and it counts towards your running totals.";
    }

    /// <summary>"this morning", "yesterday evening", "on Sunday".</summary>
    public static string When(DateTime localStart, DateOnly localToday)
    {
        var day = DateOnly.FromDateTime(localStart);
        var part = localStart.Hour switch
        {
            < 12 => "morning",
            < 17 => "afternoon",
            _ => "evening",
        };
        return day == localToday ? $"this {part}"
            : day == localToday.AddDays(-1) ? $"yesterday {part}"
            : $"on {day.DayOfWeek}";
    }

    /// <summary>"Tuesday’s Tempo".</summary>
    private static string SessionName(PlannedSession session) =>
        string.Create(CultureInfo.InvariantCulture, $"{session.Date.DayOfWeek}’s {session.Title}");
}
