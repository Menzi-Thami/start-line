using StartLine.Domain.Activities;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Coaching;

/// <summary>
/// What the coach may make a call from. A call is kept for good (<see cref="CoachWeek"/>), so it's made only from what
/// Taperday may keep for good: the runner's check-ins (ticks included) and the runs they uploaded. A run synced from
/// Strava is a 7-day cache, and anything derived from it may be kept no longer than the run itself (Strava API Policy
/// 6.2, with 5.3 and 5.5 on derived data), so it never reaches a call, however the caller found it.
/// </summary>
public static class CoachEvidence
{
    /// <summary>Whether a run may count towards a kept call: uploads only.</summary>
    public static bool MayCount(Activity run)
    {
        ArgumentNullException.ThrowIfNull(run);
        return run.Source == ActivitySource.Upload;
    }

    /// <summary>Each of the week's runs with the runner's check-in on it and the uploaded run that matched it, if any.</summary>
    public static IReadOnlyList<RunEvidence> ForWeek(IEnumerable<PlannedSession> sessions, IEnumerable<SessionCheckIn> checkIns, IEnumerable<Activity> runs)
    {
        ArgumentNullException.ThrowIfNull(sessions);
        ArgumentNullException.ThrowIfNull(checkIns);
        ArgumentNullException.ThrowIfNull(runs);
        var answers = checkIns.ToList();
        var uploads = runs.Where(MayCount).ToList();
        return
        [
            .. sessions
                .Where(s => SessionCheckIn.IsCheckable(s.Type))
                .Select(s =>
                {
                    var checkIn = answers.FirstOrDefault(c => c.Date == s.Date && c.SessionType == s.Type);
                    var run = uploads.FirstOrDefault(a => a.LocalDate == s.Date && a.PlannedSession?.SessionType == s.Type);
                    return new RunEvidence(s, checkIn?.Answers, run?.DistanceKm, run?.ComparedWithPlan?.Pace, run?.HeartRateDriftPercent);
                }),
        ];
    }

    /// <summary>The best efforts the fitness estimate may use: from uploaded runs only.</summary>
    public static IEnumerable<Effort> Efforts(IEnumerable<Activity> runs)
    {
        ArgumentNullException.ThrowIfNull(runs);
        return runs.Where(MayCount).SelectMany(a => a.BestEfforts.Select(e => new Effort(a.LocalDate, e.DistanceMetres, e.Elapsed)));
    }
}
