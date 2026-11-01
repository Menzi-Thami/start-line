using StartLine.Domain.Activities;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Coaching;

/// <summary>One Monday-to-Sunday week of the trend, the current one counted only up to today.</summary>
public sealed record TrendWeek(DateOnly WeekStart, double PlannedKm, double RanKm, double StravaKm, int Runs, int UnknownDistances, bool IsCurrent);

public enum LoadSignal { NotEnoughHistory, Lower, Steady, Rising, RisingFast }

/// <summary>The last 7 days against the average week of the 4 weeks before them.</summary>
public sealed record LoadTrend(double RecentKm, double BaselineWeeklyKm, int BaselineWeeksRun, double? ChangePercent, LoadSignal Signal);

/// <summary>The plan's sessions in the 4 weeks before today: run (ticked or uploaded), skipped, or not logged.</summary>
public sealed record SessionAdherence(int Planned, int Done, int Skipped, int Unlogged, double? Share);

/// <summary>
/// Easy runs (rated 1–4, or easy sessions without a rating) in the last 4 weeks against the 4 before, by pace and
/// heart rate. Null figures mean too few runs to say.
/// </summary>
public sealed record EffortPace(int RecentRuns, int EarlierRuns, double? RecentSecondsPerKm, double? EarlierSecondsPerKm,
    double? ChangeSecondsPerKm, int? RecentHeartRate, int? EarlierHeartRate);

public enum InsightGap { FewWeeks, MissingDistances, StravaWindow, FewEasyRuns, UnloggedSessions }

public enum NextStep { BuildAsPlanned, HoldVolume, EaseOff, LogMore }

public enum NextStepReason { OnTrack, Pain, LoadSpike, MissedSessions, SparseLogs }

/// <summary>A run as the trends need it: its day, distance, time, heart rate, and what kind of session it was.</summary>
public sealed record TrendRun(Guid Id, DateOnly Date, double DistanceKm, TimeSpan MovingTime, int? AverageHeartRate, ActivitySource Source, SessionType? SessionType);

/// <summary>A check-in as the trends need it.</summary>
public sealed record TrendCheckIn(DateOnly Date, SessionType SessionType, CheckInStatus Status, int? Effort, PainLevel? Pain, Guid? ActivityId, bool IsAdditional);

public sealed record TrainingTrendsResult(
    IReadOnlyList<TrendWeek> Weeks,
    LoadTrend Load,
    SessionAdherence Adherence,
    EffortPace EasyPace,
    IReadOnlyList<InsightGap> Gaps,
    NextStep NextStep,
    IReadOnlyList<NextStepReason> Reasons);

/// <summary>
/// Load, consistency and easy-pace trends, worked out on every read and never stored: they may include Strava runs,
/// which Taperday holds for 7 days and must not keep anything derived from (Policy 6.2). The next step is advice only; a
/// change to the plan still goes through the weekly review, where the runner accepts or declines it.
/// </summary>
public static class TrainingTrends
{
    public const int Weeks = 8;
    public const int WindowDays = 28;
    public const int MinRunsToCompare = 2;
    public const double RisingFastRatio = 1.3;
    public const double RisingRatio = 1.1;
    public const double LowerRatio = 0.8;
    public const double LowAdherence = 0.6;
    private const double MinEasyRunKm = 2;

    private static readonly SessionType[] EasyTypes = [SessionType.Easy, SessionType.Recovery, SessionType.EasyWithStrides, SessionType.Shakeout];

    public static DateOnly WeekStartOf(DateOnly day) => day.AddDays(-(((int)day.DayOfWeek + 6) % 7));

    /// <summary>The first day the trends read, so a caller loads just enough.</summary>
    public static DateOnly From(DateOnly today) => DateOnly.FromDayNumber(Math.Min(WeekStartOf(today).AddDays(-7 * (Weeks - 1)).DayNumber, today.AddDays(-2 * WindowDays).DayNumber));

    public static TrainingTrendsResult Of(
        DateOnly today,
        IReadOnlyList<LoggedRun> logged,
        IReadOnlyList<PlannedSession> sessions,
        IReadOnlyList<TrendCheckIn> checkIns,
        IReadOnlyList<TrendRun> runs)
    {
        ArgumentNullException.ThrowIfNull(logged);
        ArgumentNullException.ThrowIfNull(sessions);
        ArgumentNullException.ThrowIfNull(checkIns);
        ArgumentNullException.ThrowIfNull(runs);
        var counted = logged.Where(r => r.Date <= today).ToList();
        var checkable = sessions.Where(s => SessionCheckIn.IsCheckable(s.Type) && s.Type != SessionType.Race).ToList();

        var thisWeek = WeekStartOf(today);
        var weeks = Enumerable.Range(0, Weeks).Select(i => thisWeek.AddDays(-7 * (Weeks - 1 - i))).Select(start =>
        {
            var end = start.AddDays(6);
            var inWeek = counted.Where(r => r.Date >= start && r.Date <= end).ToList();
            return new TrendWeek(start,
                Round(checkable.Where(s => s.Date >= start && s.Date <= end).Sum(s => s.DistanceKm)),
                Round(inWeek.Sum(r => r.DistanceKm)),
                Round(inWeek.Where(r => r.Source == LoggedRunSource.Strava).Sum(r => r.DistanceKm)),
                inWeek.Count,
                inWeek.Count(r => r.DistanceUnreported),
                start == thisWeek);
        }).ToList();

        var load = LoadOf(today, counted);
        var adherence = AdherenceOf(today, checkable, checkIns, runs);
        var pace = EasyPaceOf(today, checkIns, runs);

        List<InsightGap> gaps = [];
        if (weeks.Count(w => w.Runs > 0) < 3) gaps.Add(InsightGap.FewWeeks);
        if (weeks.Any(w => w.UnknownDistances > 0)) gaps.Add(InsightGap.MissingDistances);
        if (runs.Any(r => r.Source == ActivitySource.Strava)) gaps.Add(InsightGap.StravaWindow);
        if (pace.ChangeSecondsPerKm is null) gaps.Add(InsightGap.FewEasyRuns);
        if (adherence.Unlogged > 0) gaps.Add(InsightGap.UnloggedSessions);

        var (step, reasons) = NextStepOf(today, load, adherence, checkIns, gaps);
        return new(weeks, load, adherence, pace, gaps, step, reasons);
    }

    private static LoadTrend LoadOf(DateOnly today, IReadOnlyList<LoggedRun> counted)
    {
        var recentFrom = today.AddDays(-6);
        var baselineFrom = recentFrom.AddDays(-WindowDays);
        var recent = counted.Where(r => r.Date >= recentFrom).Sum(r => r.DistanceKm);
        var baselineRuns = counted.Where(r => r.Date >= baselineFrom && r.Date < recentFrom).ToList();
        var baselineWeeksRun = Enumerable.Range(0, WindowDays / 7)
            .Count(w => baselineRuns.Any(r => r.Date >= baselineFrom.AddDays(7 * w) && r.Date < baselineFrom.AddDays(7 * (w + 1))));
        var baseline = baselineRuns.Sum(r => r.DistanceKm) / (WindowDays / 7);
        if (baselineWeeksRun < 3 || baseline <= 0)
        {
            return new(Round(recent), Round(baseline), baselineWeeksRun, null, LoadSignal.NotEnoughHistory);
        }

        var ratio = recent / baseline;
        var signal = ratio > RisingFastRatio ? LoadSignal.RisingFast
            : ratio > RisingRatio ? LoadSignal.Rising
            : ratio < LowerRatio ? LoadSignal.Lower
            : LoadSignal.Steady;
        return new(Round(recent), Round(baseline), baselineWeeksRun, Math.Round((ratio - 1) * 100), signal);
    }

    private static SessionAdherence AdherenceOf(DateOnly today, IReadOnlyList<PlannedSession> checkable, IReadOnlyList<TrendCheckIn> checkIns, IReadOnlyList<TrendRun> runs)
    {
        var from = today.AddDays(-WindowDays);
        var due = checkable.Where(s => s.Date >= from && s.Date < today).ToList();
        int done = 0, skipped = 0;
        foreach (var session in due)
        {
            var entry = checkIns.FirstOrDefault(c => !c.IsAdditional && c.Date == session.Date && c.SessionType == session.Type);
            if (entry?.Status == CheckInStatus.Skipped) skipped++;
            // A Strava run alone doesn't complete a session: the runner ticks it, or uploads the file.
            else if (entry is not null || runs.Any(r => r.Source == ActivitySource.Upload && r.Date == session.Date && r.SessionType == session.Type)) done++;
        }

        return new(due.Count, done, skipped, due.Count - done - skipped, due.Count == 0 ? null : Math.Round((double)done / due.Count, 2));
    }

    private static EffortPace EasyPaceOf(DateOnly today, IReadOnlyList<TrendCheckIn> checkIns, IReadOnlyList<TrendRun> runs)
    {
        var easy = runs.Where(r => r.DistanceKm >= MinEasyRunKm && r.MovingTime > TimeSpan.Zero && r.Date <= today).Where(r =>
        {
            var effort = checkIns.FirstOrDefault(c => c.ActivityId == r.Id && c.Effort is not null)?.Effort
                ?? checkIns.FirstOrDefault(c => !c.IsAdditional && c.Date == r.Date && r.SessionType == c.SessionType && c.Effort is not null)?.Effort;
            return effort is { } rated ? rated <= 4 : r.SessionType is { } type && EasyTypes.Contains(type);
        }).ToList();
        var recentFrom = today.AddDays(-(WindowDays - 1));
        var earlierFrom = recentFrom.AddDays(-WindowDays);
        var recent = easy.Where(r => r.Date >= recentFrom).ToList();
        var earlier = easy.Where(r => r.Date >= earlierFrom && r.Date < recentFrom).ToList();
        var recentPace = PaceOf(recent);
        var earlierPace = PaceOf(earlier);
        return new(recent.Count, earlier.Count, recentPace, earlierPace,
            recentPace is { } now && earlierPace is { } before ? Math.Round(now - before) : null,
            HeartRateOf(recent), HeartRateOf(earlier));
    }

    private static (NextStep, IReadOnlyList<NextStepReason>) NextStepOf(
        DateOnly today, LoadTrend load, SessionAdherence adherence, IReadOnlyList<TrendCheckIn> checkIns, IReadOnlyList<InsightGap> gaps)
    {
        // Safety first: pain that changed how they ran beats every other signal, then a sudden jump in load.
        if (checkIns.Any(c => c.Date > today.AddDays(-14) && c.Date <= today && c.Pain == PainLevel.ChangedRunning))
        {
            return (NextStep.EaseOff, [NextStepReason.Pain]);
        }

        List<NextStepReason> reasons = [];
        if (load.Signal == LoadSignal.RisingFast) reasons.Add(NextStepReason.LoadSpike);
        if (adherence is { Planned: >= 3, Share: < LowAdherence }) reasons.Add(NextStepReason.MissedSessions);
        if (reasons.Count > 0) return (NextStep.HoldVolume, reasons);
        if (gaps.Contains(InsightGap.FewWeeks) || adherence.Unlogged >= 2) return (NextStep.LogMore, [NextStepReason.SparseLogs]);
        return (NextStep.BuildAsPlanned, [NextStepReason.OnTrack]);
    }

    private static double? PaceOf(List<TrendRun> runs) =>
        runs.Count < MinRunsToCompare ? null : Math.Round(runs.Sum(r => r.MovingTime.TotalSeconds) / runs.Sum(r => r.DistanceKm));

    private static int? HeartRateOf(List<TrendRun> runs)
    {
        var withHeart = runs.Where(r => r.AverageHeartRate is > 0).ToList();
        return withHeart.Count < MinRunsToCompare ? null
            : (int)Math.Round(withHeart.Sum(r => r.AverageHeartRate!.Value * r.MovingTime.TotalSeconds) / withHeart.Sum(r => r.MovingTime.TotalSeconds));
    }

    private static double Round(double km) => Math.Round(km, 1);
}
