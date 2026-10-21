using StartLine.Domain.Coaching;

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
        var limitKm = Math.Max(lastFullWeekKm * (hold ? 1 : MaxWeeklyIncrease), SmallestWeekKm(p));
        for (var tries = 0; tries < 80 && Kilometres(sessions) > limitKm; tries++)
        {
            context = context with { TargetKm = context.TargetKm - 0.25 };
            sessions = TrainingWeek(p, profile, workouts, layout, context);
        }

        return sessions;
    }
}
