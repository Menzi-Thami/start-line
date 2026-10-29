using StartLine.Domain.Activities;

namespace StartLine.Domain.Coaching;

public enum LoggedRunSource
{
    /// <summary>A planned session the runner ticked off (checked in as run): counted at its planned distance.</summary>
    Ticked,

    /// <summary>A run from a file the runner uploaded: counted at the distance it measured.</summary>
    Uploaded,

    /// <summary>A currently available Strava measurement, resolved for display and never copied into saved history.</summary>
    Strava,
}

/// <summary>A session the runner checked in on, with the distance the plan asked for that day.</summary>
public sealed record TickedSession(DateOnly Date, double PlannedKm, CheckInAnswers Answers, bool IsAdditional = false, DateTimeOffset? UpdatedAt = null);

/// <summary>One resolved run in saved history or the non-persisted current display.</summary>
public sealed record LoggedRun(DateOnly Date, double DistanceKm, LoggedRunSource Source, bool DistanceUnreported = false, DateTimeOffset? CachedUntil = null);

/// <summary>
/// Saved running history through <see cref="Of"/> and a transient current view through <see cref="WithSynced"/>.
/// The current view resolves valid cached Strava measurements on each read; nothing computed from them is persisted.
/// Lasting coaching and the saved-only log retain their existing check-in/upload boundary.
/// </summary>
public static class RunningLog
{
    /// <summary>
    /// A read-only current view, including valid synced measurements. Association wins over date matching; an
    /// independently entered distance wins over the imported distance. Additional unlinked runs remain separate.
    /// No totals or imported measurements are written to check-ins or lasting coaching decisions.
    /// </summary>
    public static IReadOnlyList<LoggedRun> WithSynced(IEnumerable<TickedSession> ticks, IEnumerable<Activity> runs, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(ticks);
        ArgumentNullException.ThrowIfNull(runs);
        var entries = ticks.Where(t => t.Answers.Status != CheckInStatus.Skipped).ToList();
        var activities = runs.Where(a => a.Kind != ActivityKind.Other && (a.Source == ActivitySource.Upload || a.CachedUntil > now))
            .DistinctBy(a => a.Id).ToList();
        var ids = activities.Select(a => a.Id).ToHashSet();
        var days = activities.Select(a => a.LocalDate).ToHashSet();
        var actual = activities.Select(activity =>
        {
            var own = entries.Where(t => t.Answers.ActivityId == activity.Id && t.Answers.DistanceKm > 0 && !t.Answers.DistanceUnreported)
                .OrderByDescending(t => t.UpdatedAt).FirstOrDefault();
            return own is not null
                ? new LoggedRun(activity.LocalDate, own.Answers.DistanceKm!.Value, LoggedRunSource.Ticked)
                : new LoggedRun(activity.LocalDate, activity.DistanceKm, activity.Source == ActivitySource.Upload ? LoggedRunSource.Uploaded : LoggedRunSource.Strava,
                    CachedUntil: activity.CachedUntil);
        });
        var unlinked = entries
            .Where(t => t.Answers.ActivityId is not { } id || !ids.Contains(id))
            .Where(t => t.IsAdditional || t.Answers.ActivityId is not null || !days.Contains(t.Date))
            .Select(t => KmOf(t.Answers, t.PlannedKm) is { } km && km > 0 ? new LoggedRun(t.Date, km, LoggedRunSource.Ticked)
                : new LoggedRun(t.Date, 0, LoggedRunSource.Ticked, DistanceUnreported: true));
        return [.. actual.Concat(unlinked).OrderBy(r => r.Date).ThenBy(r => r.Source)];
    }

    /// <summary>
    /// What a ticked session counts as: the distance the runner gave, else the plan's (half of it for a run cut short, as
    /// the coach counts it). Null for a skipped run, which isn't running.
    /// </summary>
    public static double? KmOf(CheckInAnswers answers, double plannedKm)
    {
        ArgumentNullException.ThrowIfNull(answers);
        return answers.Status switch
        {
            CheckInStatus.Skipped => null,
            _ when answers.DistanceUnreported => null,
            _ when answers.DistanceKm is { } given => given,
            CheckInStatus.CutShort => plannedKm * WeeklyCoach.CutShortShare,
            _ => plannedKm,
        };
    }

    /// <summary>
    /// Ticked sessions and uploaded runs as one list, oldest first. A day with an upload counts the upload's real
    /// distance and none of that day's ticks, so a run that was both ticked and uploaded is never counted twice.
    /// </summary>
    public static IReadOnlyList<LoggedRun> Of(IEnumerable<TickedSession> ticks, IEnumerable<Activity> runs)
    {
        ArgumentNullException.ThrowIfNull(ticks);
        ArgumentNullException.ThrowIfNull(runs);
        var uploads = runs.Where(a => a.Source == ActivitySource.Upload).ToList();
        var uploadDays = uploads.Select(a => a.LocalDate).ToHashSet();
        var ticked = ticks
            .Where(t => t.IsAdditional || !uploadDays.Contains(t.Date))
            .Where(t => t.Answers.ActivityId is not { } id || !uploads.Any(a => a.Id == id))
            .Where(t => t.Answers.Status != CheckInStatus.Skipped)
            .Select(t => KmOf(t.Answers, t.PlannedKm) is { } km && km > 0 ? new LoggedRun(t.Date, km, LoggedRunSource.Ticked)
                : new LoggedRun(t.Date, 0, LoggedRunSource.Ticked, DistanceUnreported: true));
        return
        [
            .. uploads.Select(a => new LoggedRun(a.LocalDate, a.DistanceKm, LoggedRunSource.Uploaded))
                .Concat(ticked)
                .OrderBy(r => r.Date)
                .ThenBy(r => r.Source),
        ];
    }
}
