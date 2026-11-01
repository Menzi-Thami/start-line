using StartLine.Domain.Activities;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Coaching;

/// <summary>What a session asks the runner to cover: a distance, or (every step timed, as run/walk intervals) a time.</summary>
public enum PrescriptionMeasure
{
    Distance,
    Duration,
}

/// <summary>A session's prescription in the one measure it's judged by.</summary>
public sealed record SessionPrescription(PrescriptionMeasure Measure, double Km, TimeSpan Time)
{
    /// <summary>
    /// A session is time-based when it has steps and none of them is measured by distance (a beginner's run/walk
    /// intervals: "run 60 s, walk 90 s × 8"): it asks for time on feet, so its total time is what counts. Every other
    /// session is judged by its distance.
    /// </summary>
    public static SessionPrescription Of(PlannedSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        if (session.Steps is { Count: > 0 } steps && !HasDistance(steps) && TimeOf(steps) is var time && time > TimeSpan.Zero)
        {
            return new(PrescriptionMeasure.Duration, session.DistanceKm, time);
        }

        return new(PrescriptionMeasure.Distance, session.DistanceKm, TimeSpan.Zero);
    }

    private static bool HasDistance(IEnumerable<SessionStep> steps) =>
        steps.Any(s => s.DistanceKm is > 0 || (s.Block is { } block && HasDistance(block)));

    private static TimeSpan TimeOf(IEnumerable<SessionStep> steps) =>
        steps.Aggregate(TimeSpan.Zero, (sum, s) => sum + ((s.Block is { } block ? TimeOf(block) : s.Duration ?? TimeSpan.Zero) * Math.Max(1, s.Times)));
}

/// <summary>How a matched run compares with what the session asked for. Never a claim that the session was met.</summary>
public enum SyncedFeedback
{
    /// <summary>Within <see cref="SyncedCompletions.NearShare"/> of the prescription.</summary>
    Near,
    Shorter,
    Longer,

    /// <summary>Nothing to compare: no distance recorded (a treadmill run), or a session with nothing measured.</summary>
    Unmeasured,
}

public enum SyncedCompletionState
{
    /// <summary>The runner hasn't checked in: the session shows as completed via Strava while the run is held.</summary>
    Completed,

    /// <summary>The runner said they skipped it, but Strava has a run that matches: shown, never overwritten.</summary>
    Conflict,
}

/// <summary>A planned session that a Strava run Taperday holds now completes, and how the run compares with it.</summary>
public sealed record SyncedCompletion(
    DateOnly Date,
    SessionType SessionType,
    Guid ActivityId,
    SyncedCompletionState State,
    PrescriptionMeasure Measure,
    double PlannedKm,
    double ActualKm,
    TimeSpan PlannedTime,
    TimeSpan ActualTime,
    SyncedFeedback Feedback,
    DateTimeOffset? CachedUntil);

/// <summary>
/// Completion worked out on every read from the Strava runs Taperday holds now (a 7-day cache, Strava API Policy 6.2), never
/// stored: nothing derived from Strava may be kept (5.3, 5.5). When the cached copy lapses or the athlete disconnects, the
/// run is gone and the session falls back to whatever the runner ticked. Only the runner's own tick lasts, so they can keep
/// one with a single tap.
/// <para>
/// A run completes a session only when the match is certain: on the runner's local day of the session, exactly one running
/// session planned (never strength or rest, and not race day, which isn't checked in on), exactly one meaningful run that
/// day, and that run from Strava with no upload beside it (an upload already counts as the runner's own evidence). A run
/// the runner linked to a check-in, or logged as an extra run, is theirs and isn't matched again. Shorter and longer runs
/// complete it too: completion means the runner showed up and ran, and the feedback says how it compared.
/// </para>
/// </summary>
public static class SyncedCompletions
{
    /// <summary>Below this distance and <see cref="MinTime"/> both, a run is too slight to count: a GPS blip or a jog to the shop.</summary>
    public const double MinKm = 1.0;

    /// <summary>A run within this share either side of the prescription is near it: GPS and route differences, not a different run.</summary>
    public const double NearShare = 0.1;

    /// <summary>A run of at least this long counts with no distance (a treadmill run without a foot pod).</summary>
    public static readonly TimeSpan MinTime = TimeSpan.FromMinutes(10);

    /// <summary>Whether a run is real evidence of training: a sensible distance, or a sensible time on its feet.</summary>
    public static bool IsMeaningful(TrendRun run)
    {
        ArgumentNullException.ThrowIfNull(run);
        var km = double.IsFinite(run.DistanceKm) ? run.DistanceKm : 0;
        return km >= MinKm || run.MovingTime >= MinTime;
    }

    /// <param name="sessions">The plan as the coach has it.</param>
    /// <param name="checkIns">The runner's check-ins on that plan.</param>
    /// <param name="runs">The runs Taperday holds now: lapsed Strava copies and non-runs already left out by the caller.</param>
    public static IReadOnlyList<SyncedCompletion> Of(
        IReadOnlyList<PlannedSession> sessions, IReadOnlyList<TrendCheckIn> checkIns, IReadOnlyList<TrendRun> runs)
    {
        ArgumentNullException.ThrowIfNull(sessions);
        ArgumentNullException.ThrowIfNull(checkIns);
        ArgumentNullException.ThrowIfNull(runs);
        var claimed = checkIns.Where(c => c.ActivityId is not null).Select(c => c.ActivityId!.Value).ToHashSet();
        var runsByDay = runs.Where(r => !claimed.Contains(r.Id) && IsMeaningful(r))
            .DistinctBy(r => r.Id)
            .GroupBy(r => r.Date)
            .ToDictionary(g => g.Key, g => g.ToList());

        List<SyncedCompletion> completions = [];
        foreach (var day in sessions.Where(s => SessionCheckIn.IsCheckable(s.Type)).GroupBy(s => s.Date))
        {
            // Two runs planned that day, or two runs done: Taperday can't know which went with which, so it doesn't guess.
            if (day.Count() != 1 || !runsByDay.TryGetValue(day.Key, out var ran) || ran.Count != 1 || ran[0].Source != ActivitySource.Strava)
            {
                continue;
            }

            var session = day.Single();
            var run = ran[0];
            var entry = checkIns.FirstOrDefault(c => !c.IsAdditional && c.Date == session.Date && c.SessionType == session.Type);
            if (entry is not null && entry.Status != CheckInStatus.Skipped)
            {
                continue; // The runner's own word already says it was run; theirs wins.
            }

            var prescription = SessionPrescription.Of(session);
            var actualKm = double.IsFinite(run.DistanceKm) && run.DistanceKm > 0 ? run.DistanceKm : 0;
            var feedback = prescription.Measure == PrescriptionMeasure.Duration
                ? FeedbackOf(prescription.Time.TotalSeconds, run.MovingTime.TotalSeconds)
                : FeedbackOf(prescription.Km, actualKm);
            completions.Add(new SyncedCompletion(
                session.Date, session.Type, run.Id,
                entry is null ? SyncedCompletionState.Completed : SyncedCompletionState.Conflict,
                prescription.Measure, session.DistanceKm, actualKm, prescription.Time, run.MovingTime, feedback, run.CachedUntil));
        }

        return completions;
    }

    /// <summary>Shorter, longer or near the prescription, in whichever measure the session asked for.</summary>
    public static SyncedFeedback FeedbackOf(double planned, double actual)
    {
        if (!double.IsFinite(planned) || !double.IsFinite(actual) || planned <= 0 || actual <= 0)
        {
            return SyncedFeedback.Unmeasured;
        }

        return actual < planned * (1 - NearShare) ? SyncedFeedback.Shorter
            : actual > planned * (1 + NearShare) ? SyncedFeedback.Longer
            : SyncedFeedback.Near;
    }
}
