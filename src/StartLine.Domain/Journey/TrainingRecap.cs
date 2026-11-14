using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Journey;

/// <summary>A check-in as the recap reads it: the session it answers, the answer, and the runner's own distance if any.</summary>
public sealed record RecapCheckIn(
    Guid Id,
    DateOnly Date,
    SessionType SessionType,
    CheckInStatus Status,
    bool IsAdditional = false,
    double? DistanceKm = null,
    bool DistanceUnreported = false,
    Guid? ActivityId = null,
    double? PrescribedKm = null);

/// <summary>A recorded run as the recap reads it. Only <see cref="ActivitySource.Upload"/> counts as evidence.</summary>
public sealed record RecapRun(Guid Id, DateOnly Date, double DistanceKm, ActivitySource Source, ActivityKind Kind = ActivityKind.Run);

public sealed record RecapWeek(DateOnly WeekStart, int ScheduledRuns, int ConfirmedRuns, double? RecordedKm);

/// <summary>
/// The truthful story of a plan's training. Counts are of training runs (every session but the race and strength).
/// Only the runner's own "Done" confirms a run: cut short, swapped, skipped and synced Strava matches never do. Recorded
/// distance is the runner's own entered distances and uploaded files only; with none, it is null, never 0 or an estimate.
/// </summary>
public sealed record TrainingRecapResult(
    int ScheduledRuns,
    int ConfirmedRuns,
    int CutShortRuns,
    int SkippedRuns,
    int UnansweredRuns,
    int SwappedRuns,
    int Weeks,
    int RunningDays,
    double PlannedKmConfirmed,
    double? RecordedKm,
    int RecordedRuns,
    double? LongestRecordedKm,
    DateOnly? LongestRecordedOn,
    DateOnly? LastTrainingDate,
    bool AllConfirmed,
    bool TrainingEnded,
    bool RaceDatePassed,
    IReadOnlyList<RecapWeek> WeekBreakdown)
{
    /// <summary>The day the last confirmed training run was run: when "every run done" was earned.</summary>
    public DateOnly? LastConfirmedDate { get; init; }
}

public static class TrainingRecap
{
    /// <summary>Is this session a training run: anything but the race and strength.</summary>
    public static bool IsTrainingRun(SessionType type) => type is not (SessionType.Race or SessionType.Strength);

    /// <param name="startDate">The plan's first day.</param>
    /// <param name="raceDate">Race day. Runs recorded on it are the race, not training, so they aren't counted here.</param>
    /// <param name="weeks">The plan as it stands (adjustments applied), the same sessions the runner sees.</param>
    /// <param name="today">The runner's local today.</param>
    public static TrainingRecapResult Evaluate(
        DateOnly startDate, DateOnly raceDate, IReadOnlyList<PlanWeek> weeks, IEnumerable<RecapCheckIn> checkIns, IEnumerable<RecapRun> runs, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(weeks);
        ArgumentNullException.ThrowIfNull(checkIns);
        ArgumentNullException.ThrowIfNull(runs);
        var inWindow = (DateOnly d) => d >= startDate && d < raceDate;
        var entries = checkIns.Where(c => inWindow(c.Date)).ToList();
        var answers = entries.Where(c => !c.IsAdditional).GroupBy(c => (c.Date, c.SessionType)).ToDictionary(g => g.Key, g => g.First());
        var sessions = weeks.SelectMany(w => w.Sessions)
            .Where(s => IsTrainingRun(s.Type))
            .GroupBy(s => (s.Date, s.Type))
            .Select(g => g.First())
            .ToList();

        int confirmed = 0, cutShort = 0, skipped = 0, unanswered = 0, swapped = 0;
        double plannedKm = 0;
        DateOnly? lastConfirmed = null;
        var confirmedByDate = new List<DateOnly>();
        foreach (var session in sessions)
        {
            if (!answers.TryGetValue((session.Date, session.Type), out var answer))
            {
                unanswered += session.Date <= today ? 1 : 0;
                continue;
            }

            switch (answer.Status)
            {
                case CheckInStatus.Done:
                    confirmed++;
                    plannedKm += answer.PrescribedKm ?? session.DistanceKm;
                    confirmedByDate.Add(session.Date);
                    lastConfirmed = lastConfirmed is { } l && l > session.Date ? l : session.Date;
                    break;
                case CheckInStatus.CutShort:
                    cutShort++;
                    break;
                case CheckInStatus.Skipped:
                    skipped++;
                    break;
                default:
                    swapped++;
                    break;
            }
        }

        var recorded = Recorded(entries, runs.Where(r => r.Source == ActivitySource.Upload && r.Kind != ActivityKind.Other && inWindow(r.Date)).DistinctBy(r => r.Id).ToList());
        var longest = recorded.OrderByDescending(r => r.Km).ThenBy(r => r.Date).FirstOrDefault();
        var runningDays = entries.Where(c => c.Status != CheckInStatus.Skipped).Select(c => c.Date)
            .Concat(recorded.Select(r => r.Date))
            .Distinct()
            .Count();
        var lastTraining = sessions.Count == 0 ? (DateOnly?)null : sessions.Max(s => s.Date);
        var orderedWeeks = weeks.OrderBy(w => w.StartDate).ToList();
        var breakdown = orderedWeeks.Select((week, i) =>
        {
            var end = i + 1 < orderedWeeks.Count ? orderedWeeks[i + 1].StartDate : DateOnly.MaxValue;
            bool InWeek(DateOnly d) => d >= week.StartDate && d < end;
            var weekRecorded = recorded.Where(r => InWeek(r.Date)).ToList();
            return new RecapWeek(
                week.StartDate,
                sessions.Count(s => InWeek(s.Date)),
                confirmedByDate.Count(InWeek),
                weekRecorded.Count == 0 ? null : Math.Round(weekRecorded.Sum(r => r.Km), 1));
        }).ToList();

        return new TrainingRecapResult(
            sessions.Count, confirmed, cutShort, skipped, unanswered, swapped, weeks.Count, runningDays,
            Math.Round(plannedKm, 1),
            recorded.Count == 0 ? null : Math.Round(recorded.Sum(r => r.Km), 1),
            recorded.Count,
            longest is null ? null : Math.Round(longest.Km, 2),
            longest?.Date,
            lastTraining,
            sessions.Count > 0 && confirmed == sessions.Count,
            lastTraining is not { } last || last < today,
            raceDate < today,
            breakdown)
        {
            LastConfirmedDate = lastConfirmed,
        };
    }

    /// <summary>
    /// Where the plan is in the runner's journey. A recovery says most; then the race result; then a past plan is history.
    /// A race date passing, or training ending, without a result is "race pending": never an assumed finish.
    /// </summary>
    public static JourneyLifecycle Lifecycle(TrainingRecapResult recap, bool archived, RaceOutcome? outcome, RecoveryStatus? recovery)
    {
        ArgumentNullException.ThrowIfNull(recap);
        return (recovery, outcome) switch
        {
            (RecoveryStatus.Active or RecoveryStatus.Paused, _) => JourneyLifecycle.Recovering,
            (RecoveryStatus.Completed or RecoveryStatus.Ended, _) => JourneyLifecycle.Recovered,
            (_, RaceOutcome.Finished) => JourneyLifecycle.RaceCompleted,
            (_, RaceOutcome.DidNotStart or RaceOutcome.DidNotFinish) => JourneyLifecycle.RaceNotCompleted,
            _ when archived => JourneyLifecycle.Archived,
            _ when recap.RaceDatePassed => JourneyLifecycle.RacePending,
            _ when recap.AllConfirmed => JourneyLifecycle.TrainingComplete,
            _ when recap.TrainingEnded => JourneyLifecycle.RacePending,
            _ => JourneyLifecycle.Active,
        };
    }

    private sealed record Entry(DateOnly Date, double Km);

    /// <summary>
    /// Each recorded run once. An upload linked to a check-in is one run, at the runner's own distance if they gave one.
    /// A planned run checked in with a distance but no link, on a day with an upload no check-in claims, is taken as that
    /// upload (the runner's distance wins), so a run that was both ticked and uploaded never counts twice.
    /// </summary>
    private static List<Entry> Recorded(List<RecapCheckIn> checkIns, List<RecapRun> uploads)
    {
        var withDistance = checkIns.Where(c => c.Status != CheckInStatus.Skipped && !c.DistanceUnreported && c.DistanceKm is > 0).ToList();
        var uploadIds = uploads.Select(u => u.Id).ToHashSet();
        var claimed = new HashSet<Guid>();
        var entries = new List<Entry>();
        foreach (var upload in uploads)
        {
            var linked = checkIns.Where(c => c.ActivityId == upload.Id && c.Status != CheckInStatus.Skipped).ToList();
            if (linked.Count == 0)
            {
                continue;
            }

            claimed.Add(upload.Id);
            var own = withDistance.FirstOrDefault(c => c.ActivityId == upload.Id);
            entries.Add(new Entry(upload.Date, own?.DistanceKm ?? upload.DistanceKm));
        }

        foreach (var checkIn in withDistance.Where(c => c.ActivityId is not { } id || !uploadIds.Contains(id)))
        {
            if (!checkIn.IsAdditional && checkIn.ActivityId is null
                && uploads.FirstOrDefault(u => u.Date == checkIn.Date && !claimed.Contains(u.Id)) is { } sameDay)
            {
                claimed.Add(sameDay.Id);
            }

            entries.Add(new Entry(checkIn.Date, checkIn.DistanceKm!.Value));
        }

        entries.AddRange(uploads.Where(u => !claimed.Contains(u.Id)).Select(u => new Entry(u.Date, u.DistanceKm)));
        return entries;
    }
}
