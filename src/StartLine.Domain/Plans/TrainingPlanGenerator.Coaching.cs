using StartLine.Domain.Coaching;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>
/// The weekly coach's calls (<see cref="WeeklyCoach"/>), applied to the weeks they were made for. A plan with no calls
/// is exactly the plan as written. From the first call on, every week is held to 10% over the last full week on its
/// real distance, so holding a week never sets up a jump the week after.
/// </summary>
public static partial class TrainingPlanGenerator
{
    /// <summary>One dose step moves a hard session this far along its phase's progression: about one rep or set.</summary>
    private const double DoseStepProgress = 0.5;

    /// <summary>Three strong weeks in a row, and fitness at least this far ahead of the goal: a faster goal is suggested.</summary>
    private const int StrongWeeksForAFasterGoal = 3;
    private const double FasterGoalMargin = 0.02;

    /// <summary>
    /// The time the runner trains to, from a call: today's fitness when it's slower than the goal (train where you are,
    /// not where you hope to be), or the goal nudged by how hard sessions have felt. Null means the goal's own paces;
    /// fitness ahead of the goal is offered as a faster goal, never run at on the runner's behalf.
    /// </summary>
    private static TimeSpan? TrainingTime(PlanParameters p, CoachDecision call) =>
        call.Fitness is { } fitness ? (fitness > p.GoalTime ? fitness : null)
        : Math.Abs(call.PaceFactor - 1) > 0.0001 ? TimeSpan.FromSeconds(Math.Round(p.GoalTime.TotalSeconds * call.PaceFactor))
        : null;

    /// <summary>Training zones from the time the runner trains to. Race pace stays the goal's: that's what it's for.</summary>
    private static Dictionary<PaceZone, PaceRange> PacesFor(PlanParameters p, TimeSpan trainingTime)
    {
        var paces = new Dictionary<PaceZone, PaceRange>(TrainingPaces.FromGoal(p.RaceDistance, trainingTime))
        {
            [PaceZone.Race] = TrainingPaces.FromGoal(p.RaceDistance, p.GoalTime)[PaceZone.Race],
        };
        return paces;
    }

    /// <summary>
    /// The sessions' builder for each week: at the paces of the latest call that said anything about them, from that
    /// week on. Weeks before it keep the paces they were run at.
    /// </summary>
    private static Func<DateOnly, WorkoutBuilder> WorkoutsByWeek(PlanParameters p, PlanProfile profile, WorkoutBuilder atGoal)
    {
        var paced = (p.Coaching ?? []).Where(c => c.SetsPaces).OrderBy(c => c.WeekStart).ToList();
        if (paced.Count == 0)
        {
            return _ => atGoal;
        }

        var built = new Dictionary<TimeSpan, WorkoutBuilder>();
        return weekStart =>
        {
            if (paced.LastOrDefault(c => c.WeekStart <= weekStart) is not { } call || TrainingTime(p, call) is not { } time)
            {
                return atGoal;
            }

            if (!built.TryGetValue(time, out var workouts))
            {
                workouts = new WorkoutBuilder(profile.Category, PacesFor(p, time), p.RaceDistance);
                built[time] = workouts;
            }

            return workouts;
        };
    }

    /// <summary>The plan's paces as the latest call has them, and a faster goal once fitness has run ahead of it.</summary>
    private static TrainingPlan WithFitness(PlanParameters p, PlanProfile profile, TrainingPlan plan)
    {
        var calls = (p.Coaching ?? []).OrderBy(c => c.WeekStart).ToList();
        if (calls.LastOrDefault(c => c.SetsPaces) is { } latest && TrainingTime(p, latest) is { } time)
        {
            plan = plan with { Paces = PacesFor(p, time) };
        }

        var recent = calls.TakeLast(StrongWeeksForAFasterGoal).ToList();
        if (plan.SuggestedGoal is null
            && recent.Count == StrongWeeksForAFasterGoal
            && recent.All(c => c.Verdict == CoachVerdict.Thriving)
            && recent[^1].Fitness is { } fitness
            && fitness.TotalSeconds < p.GoalTime.TotalSeconds * (1 - FasterGoalMargin))
        {
            var faster = RoundedGoal(fitness, profile);
            plan = plan with
            {
                SuggestedGoal = faster,
                Warnings =
                [
                    .. plan.Warnings,
                    new PlanWarning("goal-within-reach",
                        $"Three strong weeks, and your recent runs point to about {Clock(faster)}. Aim for it if you'd like the plan to ask more of you."),
                ],
            };
        }

        return plan;
    }

    /// <summary>A goal rounded the way runners say them: to 10 s for a 5K or 10K, to the minute beyond.</summary>
    private static TimeSpan RoundedGoal(TimeSpan time, PlanProfile profile)
    {
        var step = profile.Category is DistanceCategory.FiveK or DistanceCategory.TenK ? 10 : 60;
        return TimeSpan.FromSeconds(Math.Round(time.TotalSeconds / step) * step);
    }

    private static CoachDecision? CallFor(PlanParameters p, DateOnly weekStart) =>
        p.Coaching?.FirstOrDefault(d => d.WeekStart == weekStart);

    /// <summary>Whether the coach has made a call for this week or any before it: from then on, weeks are fitted.</summary>
    private static bool IsCoachedFrom(PlanParameters p, DateOnly weekStart) =>
        p.Coaching?.Any(d => d.WeekStart <= weekStart && d.ChangesThePlan) == true;

    /// <summary>The week as the coach called it: held at last week's volume, eased off now, or a step easier or harder.</summary>
    private static WeekContext Coached(WeekContext week, CoachDecision? call, double lastFullWeekKm)
    {
        if (call is null || !call.ChangesThePlan)
        {
            return week;
        }

        var targetKm = call.CutbackNow ? Math.Min(week.TargetKm, lastFullWeekKm * CutbackFactor)
            : call.HoldVolume ? Math.Min(week.TargetKm, lastFullWeekKm)
            : week.TargetKm;
        return week with { TargetKm = targetKm, IsCutback = week.IsCutback || call.CutbackNow, DoseStep = call.DoseStep, FitToVolume = true };
    }

    /// <summary>
    /// Builds the week, held to 10% over the last full week on its real distance (or to the same distance, when the coach
    /// has called a hold). Runs are rounded to the half kilometre, which at low volumes can tip a week over, so the
    /// target is trimmed a little at a time until it fits: small steps lose as little of the week as possible, because
    /// the next week's limit is measured from this one.
    /// </summary>
    private static List<PlannedSession> FittedWeek(
        PlanParameters p, PlanProfile profile, WorkoutBuilder workouts, WeekLayout layout, ref WeekContext context, double lastFullWeekKm, bool hold = false)
    {
        var sessions = TrainingWeek(p, profile, workouts, layout, context);
        var limitKm = TenPercentLimitKm(p, lastFullWeekKm, hold);
        for (var tries = 0; tries < 80 && Kilometres(sessions) > limitKm; tries++)
        {
            context = context with { TargetKm = context.TargetKm - 0.25 };
            sessions = TrainingWeek(p, profile, workouts, layout, context);
        }

        return sessions;
    }
}
