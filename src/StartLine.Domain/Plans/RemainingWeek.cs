using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>
/// An accepted change, including the original prescription. Null EasyKm means rest. With <paramref name="MovedFrom"/>, the
/// session planned on that day is run on <paramref name="Date"/> instead, as written. A move from a day still to come also
/// rests that day (its own revision); a missed day in the past keeps its history and is made up here.
/// With <paramref name="Type"/> (an exact change from <see cref="SessionAdjuster"/>), the run stays that steady type at
/// <paramref name="EasyKm"/>, which may be a little longer than the original, and the two paces are for its own zone.
/// Without it, the run becomes an easy run of at most its original distance, as every change saved before it.
/// </summary>
public sealed record SessionRevision(DateOnly AppliedOn, DateOnly Date, SessionType OriginalType, string OriginalTitle,
    double OriginalKm, double? EasyKm, double? EasyFastestSecondsPerKm = null, double? EasySlowestSecondsPerKm = null, DateOnly? MovedFrom = null,
    SessionType? Type = null);

public static class RemainingWeek
{
    public const double ResetRunLimitKm = 8;
    public const double MinimumRunKm = 1;

    /// <summary>
    /// Whether at least two of these runs felt harder than their kind of run should (the weekly coach's own rule: the effort
    /// the runner gave is at least <see cref="WeeklyCoach.FeltHarderBy"/> above the top of the expected range for what they ran).
    /// </summary>
    public static bool FeltHarderTwice(IEnumerable<SessionCheckIn> checkIns) =>
        checkIns.Count(c => c.Status != CheckInStatus.Skipped && c.Effort is { } effort
            && ExpectedEffort.For(c.ActualSessionType ?? c.SessionType) is { } expected && effort >= expected.High + WeeklyCoach.FeltHarderBy)
        >= WeeklyCoach.HardRunsToStruggle;

    /// <param name="reportedOnly">
    /// Only what the runner reported counts: their skips, short or swapped runs, pain and effort. A day without a check-in is
    /// not treated as missed, so a Strava run the runner hasn't rated yet never looks like a missed session. Used when the
    /// coach checks the week by itself after a rating; the runner's own "Ease the rest of this week" counts unlogged days.
    /// </param>
    public static IReadOnlyList<SessionRevision> Preview(TrainingPlan plan, IReadOnlyList<SessionCheckIn> checkIns,
        IReadOnlyList<Activity> activities, DateOnly today, double? originalWeeklyKm = null, bool reportedOnly = false)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(checkIns);
        ArgumentNullException.ThrowIfNull(activities);
        var week = plan.Weeks.FirstOrDefault(w => w.StartDate <= today && today < w.StartDate.AddDays(7));
        if (week is null || week.Phase == TrainingPhase.RaceWeek) return [];
        var entries = checkIns.Where(c => c.Date >= week.StartDate && c.Date <= today).ToList();
        var uploads = activities.Where(a => a.Source == ActivitySource.Upload && a.LocalDate >= week.StartDate && a.LocalDate <= today).ToList();
        var missed = week.Sessions.Where(s => s.Date < today && SessionCheckIn.IsCheckable(s.Type)).Any(s =>
        {
            var entry = entries.FirstOrDefault(c => !c.IsAdditional && c.Date == s.Date && c.SessionType == s.Type);
            return entry?.Status == CheckInStatus.Skipped || !reportedOnly && entry is null && !uploads.Any(a => a.LocalDate == s.Date);
        });
        var changed = entries.Any(c => c.IsAdditional || c.Status is CheckInStatus.Skipped or CheckInStatus.CutShort or CheckInStatus.SwappedForEasy
            || c.ActualSessionType is { } actual && actual != c.SessionType
            || c.DistanceKm is { } km && week.Sessions.Any(s => s.Date == c.Date && s.Type == c.SessionType && Math.Abs(s.DistanceKm - km) >= 0.5));
        var pain = entries.Any(c => c.Pain == PainLevel.ChangedRunning);
        // Two runs that felt much harder than they should: the rest of the week eases (hard sessions become easy runs).
        var strained = FeltHarderTwice(entries.Where(c => !c.IsAdditional));
        if (!missed && !changed && !pain && !strained) return [];
        var future = week.Sessions.Where(s => s.Date > today && SessionCheckIn.IsCheckable(s.Type)).OrderBy(s => s.Date).ToList();
        // Persisted decisions use only manual entries and uploads, never cached Strava metrics.
        var ran = uploads.Sum(a => a.DistanceKm) + entries.Where(c => c.Status != CheckInStatus.Skipped && c.DistanceKm.HasValue
            && !uploads.Any(a => a.Id == c.ActivityId || !c.IsAdditional && a.LocalDate == c.Date)).Sum(c => c.DistanceKm!.Value);
        var budget = Math.Max(0, Math.Min(future.Sum(s => s.DistanceKm), (originalWeeklyKm ?? week.PlannedKm) - ran));
        List<SessionRevision> result = [];
        foreach (var session in future)
        {
            if (checkIns.Any(c => !c.IsAdditional && c.Date == session.Date && c.SessionType == session.Type))
            {
                budget = Math.Max(0, budget - session.DistanceKm);
                continue;
            }
            var km = pain ? 0 : Math.Floor(Math.Min(Math.Min(session.DistanceKm, ResetRunLimitKm), budget) * 4) / 4;
            if (km < MinimumRunKm) km = 0;
            if (km == 0 || session.Type != SessionType.Easy || km < session.DistanceKm)
            {
                var pace = plan.Paces[PaceZone.Easy];
                result.Add(new(today, session.Date, session.Type, session.Title, session.DistanceKm, km == 0 ? null : km,
                    pace.Fastest.SecondsPerKilometre, pace.Slowest.SecondsPerKilometre));
            }
            budget = Math.Max(0, budget - km);
        }
        return result;
    }

    public static TrainingPlan Apply(TrainingPlan plan, IReadOnlyList<SessionRevision>? changes)
    {
        ArgumentNullException.ThrowIfNull(plan);
        if (changes is not { Count: > 0 }) return plan;
        // A moved session is the plan's own, as written, on its new day.
        var moved = changes.Where(c => c.MovedFrom is not null)
            .Select(c => plan.Weeks.SelectMany(w => w.Sessions).FirstOrDefault(s => s.Date == c.MovedFrom && s.Type == c.OriginalType) is { } source ? source with { Date = c.Date } : null)
            .OfType<PlannedSession>().ToList();
        return plan with
        {
            Weeks = [.. plan.Weeks.Select(week => week with { Sessions = [.. week.Sessions.SelectMany(session =>
        {
            var revision = changes.LastOrDefault(c => c.Date == session.Date && c.MovedFrom is null);
            if (revision is null || !SessionCheckIn.IsCheckable(session.Type)) return new[] { session };
            if (revision.EasyKm is not { } km) return Array.Empty<PlannedSession>();
            var paces = new Dictionary<PaceZone, PaceRange>(plan.Paces);
            if (revision.Type is { } kept && SessionAdjuster.IsSteady(kept))
            {
                // An exact change keeps the run what it was: a long run stays a long run, with its run/walk, at its new distance.
                if (revision is { EasyFastestSecondsPerKm: { } keptFast, EasySlowestSecondsPerKm: { } keptSlow })
                    paces[SessionAdjuster.ZoneOf(kept)] = new(Pace.FromSecondsPerKilometre(keptFast), Pace.FromSecondsPerKilometre(keptSlow));
                var builder = new WorkoutBuilder(plan.Category, paces, plan.RaceDistance, runWalk: session.RunWalk is not null);
                return new[]
                {
                    kept switch
                    {
                        SessionType.LongRun => builder.Long(session.Date, SessionType.LongRun, km),
                        SessionType.MediumLongRun => builder.MediumLong(session.Date, km),
                        _ => builder.Easy(session.Date, kept, km),
                    },
                };
            }

            if (revision is { EasyFastestSecondsPerKm: { } fast, EasySlowestSecondsPerKm: { } slow })
                paces[PaceZone.Easy] = new(Pace.FromSecondsPerKilometre(fast), Pace.FromSecondsPerKilometre(slow));
            return new[] { new WorkoutBuilder(plan.Category, paces, plan.RaceDistance).Easy(session.Date, SessionType.Easy, Math.Min(km, session.DistanceKm)) };
        }).Concat(moved.Where(m => m.Date >= week.StartDate && m.Date < week.StartDate.AddDays(7))).OrderBy(s => s.Date)] })]
        };
    }
}
