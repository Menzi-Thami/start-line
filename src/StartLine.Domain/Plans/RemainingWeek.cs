using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>An accepted change, including the original prescription. Null EasyKm means rest.</summary>
public sealed record SessionRevision(DateOnly AppliedOn, DateOnly Date, SessionType OriginalType, string OriginalTitle,
    double OriginalKm, double? EasyKm, double? EasyFastestSecondsPerKm = null, double? EasySlowestSecondsPerKm = null);

public static class RemainingWeek
{
    public const double ResetRunLimitKm = 8;
    public const double MinimumRunKm = 1;

    public static IReadOnlyList<SessionRevision> Preview(TrainingPlan plan, IReadOnlyList<SessionCheckIn> checkIns,
        IReadOnlyList<Activity> activities, DateOnly today, double? originalWeeklyKm = null)
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
            return entry?.Status == CheckInStatus.Skipped || entry is null && !uploads.Any(a => a.LocalDate == s.Date);
        });
        var changed = entries.Any(c => c.IsAdditional || c.Status is CheckInStatus.Skipped or CheckInStatus.CutShort or CheckInStatus.SwappedForEasy
            || c.ActualSessionType is { } actual && actual != c.SessionType
            || c.DistanceKm is { } km && week.Sessions.Any(s => s.Date == c.Date && s.Type == c.SessionType && Math.Abs(s.DistanceKm - km) >= 0.5));
        var pain = entries.Any(c => c.Pain == PainLevel.ChangedRunning);
        if (!missed && !changed && !pain) return [];
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
        return plan with
        {
            Weeks = [.. plan.Weeks.Select(week => week with { Sessions = [.. week.Sessions.SelectMany(session =>
        {
            var revision = changes.LastOrDefault(c => c.Date == session.Date);
            if (revision is null || !SessionCheckIn.IsCheckable(session.Type)) return new[] { session };
            if (revision.EasyKm is not { } km) return Array.Empty<PlannedSession>();
            var paces = new Dictionary<PaceZone, PaceRange>(plan.Paces);
            if (revision is { EasyFastestSecondsPerKm: { } fast, EasySlowestSecondsPerKm: { } slow })
                paces[PaceZone.Easy] = new(Pace.FromSecondsPerKilometre(fast), Pace.FromSecondsPerKilometre(slow));
            return new[] { new WorkoutBuilder(plan.Category, paces, plan.RaceDistance).Easy(session.Date, SessionType.Easy, Math.Min(km, session.DistanceKm)) };
        })] })]
        };
    }
}
