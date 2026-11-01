using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Coaching;

/// <summary>One Monday-to-Sunday week of the story: distance run and planned, runs, and the longest run.</summary>
public sealed record ProgressWeek(DateOnly WeekStart, double RanKm, double PlannedKm, int Runs, double LongestKm, bool IsCurrent);

/// <summary>A span of days, summed: the window on screen, or the same length just before it.</summary>
public sealed record ProgressPeriod(DateOnly From, DateOnly To, double Km, int Runs, double AverageWeeklyKm, double LongestKm, int WeeksRun);

/// <summary>The fastest time over a standard distance in the window, and the fastest before it, from runs Taperday holds.</summary>
public sealed record ProgressBest(string Name, double DistanceMetres, TimeSpan Time, DateOnly Date, TimeSpan? Before, bool IsNew);

/// <summary>What the runner could race at the end of a week, from their uploaded runs.</summary>
public sealed record RaceEstimate(DateOnly WeekStart, TimeSpan Time);

/// <summary>The plan's goal, and the estimates the window's uploads point to, week by week.</summary>
public sealed record RaceGoalProgress(double RaceKm, TimeSpan Goal, DateOnly RaceDate, IReadOnlyList<RaceEstimate> Estimates, TimeSpan? Latest, TimeSpan? First);

public enum ProgressGap { FewWeeks, NoBaseline, MissingDistances, StravaWindow, NoRaceEstimate, NoPlan }

public sealed record ProgressStoryResult(
    int Weeks,
    IReadOnlyList<ProgressWeek> WeekRows,
    ProgressPeriod Current,
    ProgressPeriod Previous,
    SessionAdherence Adherence,
    EffortPace EasyPace,
    IReadOnlyList<ProgressBest> Bests,
    RaceGoalProgress? RaceGoal,
    IReadOnlyList<ProgressGap> Gaps);

/// <summary>A run as the story needs it: the trend run, plus its best efforts.</summary>
public sealed record ProgressRun(TrendRun Run, IReadOnlyList<BestEffort> Efforts);

/// <summary>
/// How the runner has progressed over the last 4, 8 or 12 weeks against the same span before: distance, consistency,
/// long runs, easy pace, personal bests and the race goal. Worked out on every read and never stored, like
/// <see cref="TrainingTrends"/>. The race estimate uses uploaded runs only, as the coach does (<see cref="CoachEvidence"/>).
/// </summary>
public static class ProgressStory
{
    public static readonly IReadOnlyList<int> Spans = [4, 8, 12];

    /// <summary>The distances a runner thinks of as bests; shorter splits say little about progress.</summary>
    public static readonly IReadOnlyList<double> HeadlineMetres = [1000, 1609.344, 5000, 10_000, 21_097.5, 42_195];

    public static bool IsSpan(int weeks) => Spans.Contains(weeks);

    /// <summary>The first day the story reads for a span: the window and the same length before it.</summary>
    public static DateOnly From(DateOnly today, int weeks) =>
        DateOnly.FromDayNumber(Math.Min(TrainingTrends.WeekStartOf(today).AddDays(-7 * (weeks - 1)).DayNumber, today.AddDays(-14 * weeks + 1).DayNumber));

    public static ProgressStoryResult Of(
        DateOnly today,
        int weeks,
        IReadOnlyList<LoggedRun> logged,
        IReadOnlyList<PlannedSession> sessions,
        IReadOnlyList<TrendCheckIn> checkIns,
        IReadOnlyList<ProgressRun> runs,
        TrainingPlan? plan)
    {
        ArgumentNullException.ThrowIfNull(logged);
        ArgumentNullException.ThrowIfNull(sessions);
        ArgumentNullException.ThrowIfNull(checkIns);
        ArgumentNullException.ThrowIfNull(runs);
        if (!IsSpan(weeks))
        {
            throw new Common.DomainException("Choose 4, 8 or 12 weeks.");
        }

        var counted = logged.Where(r => r.Date <= today).ToList();
        var trendRuns = runs.Select(r => r.Run).ToList();
        var thisWeek = TrainingTrends.WeekStartOf(today);
        var rows = Enumerable.Range(0, weeks).Select(i => thisWeek.AddDays(-7 * (weeks - 1 - i))).Select(start =>
        {
            var inWeek = counted.Where(r => r.Date >= start && r.Date <= start.AddDays(6)).ToList();
            return new ProgressWeek(start,
                Round(inWeek.Sum(r => r.DistanceKm)),
                Round(sessions.Where(s => s.Date >= start && s.Date <= start.AddDays(6) && SessionCheckIn.IsCheckable(s.Type) && s.Type != SessionType.Race).Sum(s => s.DistanceKm)),
                inWeek.Count,
                Round(inWeek.Select(r => r.DistanceKm).DefaultIfEmpty(0).Max()),
                start == thisWeek);
        }).ToList();

        var days = 7 * weeks;
        var currentFrom = today.AddDays(-(days - 1));
        var previousFrom = currentFrom.AddDays(-days);
        var current = PeriodOf(counted, currentFrom, today, weeks);
        var previous = PeriodOf(counted, previousFrom, currentFrom.AddDays(-1), weeks);
        var adherence = TrainingTrends.AdherenceOf(today, sessions, checkIns, trendRuns, days);
        var pace = TrainingTrends.EasyPaceOf(today, checkIns, trendRuns, days);
        var bests = BestsOf(runs, currentFrom, today);
        var goal = plan is null ? null : RaceGoalOf(plan, rows, runs, today);

        List<ProgressGap> gaps = [];
        if (current.WeeksRun < 2) gaps.Add(ProgressGap.FewWeeks);
        if (previous.Runs == 0) gaps.Add(ProgressGap.NoBaseline);
        if (counted.Any(r => r.Date >= previousFrom && r.DistanceUnreported)) gaps.Add(ProgressGap.MissingDistances);
        if (trendRuns.Any(r => r.Source == ActivitySource.Strava)) gaps.Add(ProgressGap.StravaWindow);
        if (plan is null) gaps.Add(ProgressGap.NoPlan);
        else if (goal?.Latest is null) gaps.Add(ProgressGap.NoRaceEstimate);
        return new(weeks, rows, current, previous, adherence, pace, bests, goal, gaps);
    }

    private static ProgressPeriod PeriodOf(List<LoggedRun> counted, DateOnly from, DateOnly to, int weeks)
    {
        var inPeriod = counted.Where(r => r.Date >= from && r.Date <= to).ToList();
        var weeksRun = Enumerable.Range(0, weeks).Count(w => inPeriod.Any(r => r.Date >= from.AddDays(7 * w) && r.Date < from.AddDays(7 * (w + 1))));
        var km = inPeriod.Sum(r => r.DistanceKm);
        return new(from, to, Round(km), inPeriod.Count, Round(km / weeks), Round(inPeriod.Select(r => r.DistanceKm).DefaultIfEmpty(0).Max()), weeksRun);
    }

    private static List<ProgressBest> BestsOf(IReadOnlyList<ProgressRun> runs, DateOnly from, DateOnly to)
    {
        List<ProgressBest> bests = [];
        foreach (var metres in HeadlineMetres)
        {
            var efforts = runs.SelectMany(r => r.Efforts.Where(e => Math.Abs(e.DistanceMetres - metres) < 0.5).Select(e => (r.Run.Date, e.Elapsed))).ToList();
            var inWindow = efforts.Where(e => e.Date >= from && e.Date <= to).OrderBy(e => e.Elapsed).FirstOrDefault();
            if (inWindow == default)
            {
                continue;
            }

            var before = efforts.Where(e => e.Date < from).Select(e => (TimeSpan?)e.Elapsed).Min();
            bests.Add(new(StandardDistance.Find(metres)!.Name, metres, inWindow.Elapsed, inWindow.Date, before, before is null || inWindow.Elapsed < before));
        }

        return bests;
    }

    private static RaceGoalProgress RaceGoalOf(TrainingPlan plan, List<ProgressWeek> rows, IReadOnlyList<ProgressRun> runs, DateOnly today)
    {
        // Uploads only, as the coach's own estimate: a Strava run is held 7 days, so a week-by-week line would come and go.
        var efforts = runs.Where(r => r.Run.Source == ActivitySource.Upload)
            .SelectMany(r => r.Efforts.Select(e => new Effort(r.Run.Date, e.DistanceMetres, e.Elapsed))).ToList();
        var estimates = rows
            .Select(w => (w.WeekStart, AsOf: w.IsCurrent ? today.AddDays(1) : w.WeekStart.AddDays(7)))
            .Select(w => (w.WeekStart, Time: Fitness.Estimate(plan.RaceDistance, w.AsOf, efforts)))
            .Where(w => w.Time is not null)
            .Select(w => new RaceEstimate(w.WeekStart, w.Time!.Value))
            .ToList();
        return new(plan.RaceDistance.Kilometres, plan.GoalTime, plan.RaceDate, estimates, estimates.LastOrDefault()?.Time, estimates.FirstOrDefault()?.Time);
    }

    private static double Round(double km) => Math.Round(km, 1);
}
