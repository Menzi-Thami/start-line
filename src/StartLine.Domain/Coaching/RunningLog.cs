using StartLine.Domain.Activities;

namespace StartLine.Domain.Coaching;

public enum LoggedRunSource
{
    /// <summary>A planned session the runner ticked off (checked in as run): counted at its planned distance.</summary>
    Ticked,

    /// <summary>A run from a file the runner uploaded: counted at the distance it measured.</summary>
    Uploaded,
}

/// <summary>A session the runner checked in on, with the distance the plan asked for that day.</summary>
public sealed record TickedSession(DateOnly Date, double PlannedKm, CheckInAnswers Answers, bool IsAdditional = false);

/// <summary>One run that counts towards the runner's long-term totals.</summary>
public sealed record LoggedRun(DateOnly Date, double DistanceKm, LoggedRunSource Source, bool DistanceUnreported = false);

/// <summary>
/// The runner's running as Taperday may keep it for good: what they ticked off and what they uploaded. Runs synced from
/// Strava are a 7-day cache, and totals built from them would be data derived from Strava and kept for longer, or Strava
/// data combined with the runner's own (Strava API Policy 5.3, 5.4, 5.5, 6.2), so they never count here: a runner who
/// wants a Strava run to count ticks its session.
/// </summary>
public static class RunningLog
{
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
