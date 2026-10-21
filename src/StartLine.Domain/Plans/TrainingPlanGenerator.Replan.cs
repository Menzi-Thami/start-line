using System.Globalization;
using StartLine.Domain.Common;

namespace StartLine.Domain.Plans;

/// <summary>
/// "Replan from here": after missed training, illness, injury or a lean spell, the weeks already run stay as they were
/// and the rest is rebuilt from a volume the runner can manage now. The race date and goal never change; every training
/// rule of a fresh plan still holds, and when the lost volume can't be won back the plan suggests a goal instead.
/// </summary>
public static partial class TrainingPlanGenerator
{
    // The setback has to cost a tenth of the peak week or more to put the goal at risk, so a plan that was thin from the
    // start (and already said so) isn't flagged again.
    private const double GoalRiskShortfall = 0.10;

    // About 2% slower for every 10% of the peak lost, never more than 10% slower in all.
    private const double GoalSlowdownPerShortfall = 0.2;
    private const double MaxGoalSlowdown = 0.10;

    /// <summary>The share of what the runner had built up to that they restart at.</summary>
    private static double RestartShare(Setback setback) => setback switch
    {
        Setback.MissedTraining => 0.8,
        Setback.Illness => 0.6,
        Setback.Injury => 0.5,
        _ => 1.0,
    };

    /// <summary>Weeks of easy running only before hard sessions come back.</summary>
    private static int EasyOnlyWeeks(Setback setback) => setback switch
    {
        Setback.Illness => 1,
        Setback.Injury => 2,
        _ => 0,
    };

    /// <summary>Fitness lost to the setback itself, on top of the lost volume, when suggesting a goal.</summary>
    private static double GoalPenalty(Setback setback) => setback switch
    {
        Setback.Illness => 0.02,
        Setback.Injury => 0.04,
        _ => 0,
    };

    private static void ValidateReplan(PlanParameters p, PlanReplan replan)
    {
        if (!Enum.IsDefined(replan.Setback))
        {
            throw new DomainException("Unknown reason for replanning.");
        }

        if (replan.From < p.Today)
        {
            throw new DomainException("A plan can't be replanned from before it was built.");
        }

        if (replan.RecentWeeklyKm is < 0 or > 300)
        {
            throw new DomainException("Last week's distance must be between 0 and 300 km.");
        }

        if (replan.Setback == Setback.Behind && replan.RecentWeeklyKm is not > 0)
        {
            throw new DomainException("Say how far you ran last week, so the plan can pick up from there.");
        }

        var restart = FirstMondayOnOrAfter(replan.From);
        if ((MondayOf(p.RaceDate).DayNumber - restart.DayNumber) / 7 + 1 < MinWeeks)
        {
            throw new DomainException("Your race is too close to rebuild the plan. Rest if you need to, then follow your taper.");
        }
    }

    private static TrainingPlan Replanned(
        PlanParameters p, PlanReplan replan, TrainingPlan original, PlanProfile profile, WorkoutBuilder workouts, WeekLayout layout)
    {
        var replanWeek = MondayOf(replan.From);
        var restart = FirstMondayOnOrAfter(replan.From);
        var restartKm = RestartKm(p, replan, BaselineKm(original, replanWeek));

        // The weeks already run stay exactly as they were, so the history and the sessions ticked off in it survive.
        var weeks = original.Weeks.Where(w => w.StartDate < replanWeek).ToList();
        if (replanWeek < restart && original.Weeks.SingleOrDefault(w => w.StartDate == replanWeek) is { } thisWeek)
        {
            weeks.Add(thisWeek with { Sessions = RestOfThisWeek(p, replan, thisWeek, restartKm), IsReplanned = true });
        }

        // From the next Monday every week keeps its date, number and phase (a runner in Peak stays in Peak), but its
        // volume grows again from the restart. The cutback count restarts with it.
        var ahead = original.Weeks.Where(w => w.StartDate >= restart).ToList();
        var building = ahead.Count(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak);
        var originalPeakKm = original.Weeks.Where(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak).Max(w => w.PlannedKm);
        var peakKm = building == 0 ? restartKm : Math.Max(restartKm, Math.Min(originalPeakKm, ReachableKm(restartKm, building)));
        var volumes = Ramp(restartKm, peakKm, building);
        var taperFactors = TaperFactors(original.Weeks.Count(w => w.Phase == TrainingPhase.Taper));
        var easyOnly = EasyOnlyWeeks(replan.Setback);
        var lastFullWeekKm = restartKm;

        for (var i = 0; i < ahead.Count - 1; i++)
        {
            var week = ahead[i];
            var (index, length) = PhasePosition(original, week);
            var context = week.Phase == TrainingPhase.Taper
                ? new WeekContext(week.StartDate, peakKm * taperFactors[index], TrainingPhase.Taper, index, 0,
                    IsCutback: false, IsFirstWeek: i == 0, EasyOnly: i < easyOnly, FitToVolume: true)
                : new WeekContext(week.StartDate, volumes[i], week.Phase, index, length <= 1 ? 1 : index / (double)(length - 1),
                    IsCutback(i, building), IsFirstWeek: i == 0, EasyOnly: i < easyOnly, FitToVolume: true);
            // The coach's calls still apply on top of the rebuild, and every rebuilt week is held to the 10% limit.
            var call = CallFor(p, week.StartDate);
            context = Coached(context, call, lastFullWeekKm);
            var sessions = FittedWeek(p, profile, workouts, layout, ref context, lastFullWeekKm, call?.HoldVolume == true);

            if (!context.IsCutback)
            {
                lastFullWeekKm = Kilometres(sessions);
            }

            weeks.Add(new PlanWeek(week.Number, week.StartDate, week.Phase, context.IsCutback, sessions, IsReplanned: true));
        }

        var raceWeek = ahead[^1];
        weeks.Add(new PlanWeek(raceWeek.Number, raceWeek.StartDate, TrainingPhase.RaceWeek, false,
            RaceWeek(p, profile, workouts, layout, raceWeek.StartDate, peakKm * profile.RaceWeekFactor), IsReplanned: true));

        // The other warnings describe the plan as first built, not the rebuild.
        var warnings = original.Warnings.Where(w => w.Code == "back-to-back").ToList();
        if (replan.Setback == Setback.Injury)
        {
            warnings.Add(new("injury",
                "Start this only once you can run without pain, and see a physio if you're not sure. " +
                "If the pain comes back, stop and rest: the plan can be rebuilt again."));
        }

        var rebuiltPeakKm = weeks.Where(w => w.IsReplanned && w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak)
            .Select(w => w.PlannedKm).DefaultIfEmpty().Max();
        var suggested = building == 0 ? null : SuggestedGoal(p, profile, originalPeakKm, rebuiltPeakKm, replan.Setback);
        if (suggested is { } goal)
        {
            warnings.Add(new("goal-at-risk",
                $"There isn't time to win back all the training you lost before race day, so {Clock(p.GoalTime)} is now a stretch. " +
                $"{Clock(goal)} is a more realistic goal. Your plan keeps your goal until you change it."));
        }

        return original with { Weeks = weeks, Warnings = warnings, Replan = replan, SuggestedGoal = suggested };
    }

    /// <summary>What the runner had built up to: the bigger of the two weeks before the replan week, as one may be a cutback.</summary>
    private static double BaselineKm(TrainingPlan original, DateOnly replanWeek)
    {
        var before = original.Weeks.Where(w => w.StartDate < replanWeek).TakeLast(2).ToList();
        return before.Count > 0 ? before.Max(w => w.PlannedKm) : original.Weeks[0].PlannedKm;
    }

    private static double RestartKm(PlanParameters p, PlanReplan replan, double baselineKm)
    {
        // Behind: pick up from what they really ran, never from more than the plan had reached.
        var restartKm = replan.Setback == Setback.Behind
            ? Math.Min(replan.RecentWeeklyKm ?? baselineKm, baselineKm)
            : baselineKm * RestartShare(replan.Setback);

        // Never more than 10% above what they actually ran last week, when they said.
        if (replan.Setback != Setback.Behind && replan.RecentWeeklyKm is double recent && recent > 0)
        {
            restartKm = Math.Min(restartKm, recent * MaxWeeklyIncrease);
        }

        return Math.Max(restartKm, SmallestWeekKm(p));
    }

    /// <summary>The shortest week there is: the shortest long run and the shortest run on every other day.</summary>
    private static double SmallestWeekKm(PlanParameters p) => MinLongRunKm + (p.RunsPerWeek - 1) * MinRunKm;

    /// <summary>
    /// From the replan date to Sunday: rest after illness or injury; otherwise the runs stay, but all of them easy and
    /// none longer than a restart week's easy run.
    /// </summary>
    private static List<PlannedSession> RestOfThisWeek(PlanParameters p, PlanReplan replan, PlanWeek week, double restartKm)
    {
        var resting = replan.Setback is Setback.Illness or Setback.Injury;
        var easyKm = WorkoutBuilder.Round(Math.Clamp(restartKm / p.RunsPerWeek, MinRunKm, MaxEasyRunKm));
        return
        [
            .. week.Sessions
                .Where(s => s.Date < replan.From || !resting)
                .Select(s => s.Date < replan.From || s.Type == SessionType.Strength
                    ? s
                    : WorkoutBuilder.Easy(s.Date, s.Type is SessionType.Recovery or SessionType.EasyWithStrides ? s.Type : SessionType.Easy,
                        Math.Min(s.DistanceKm, easyKm))),
        ];
    }

    private static double Kilometres(List<PlannedSession> sessions) => Math.Round(sessions.Sum(s => s.DistanceKm), 1);

    /// <summary>Where a week sits in its phase, so a rebuilt week keeps the sessions its phase rotation gave it.</summary>
    private static (int Index, int Length) PhasePosition(TrainingPlan plan, PlanWeek week)
    {
        var inPhase = plan.Weeks.Where(w => w.Phase == week.Phase).ToList();
        return (inPhase.FindIndex(w => w.StartDate == week.StartDate), inPhase.Count);
    }

    /// <summary>
    /// A slower goal when the rebuild can no longer reach the volume this race usually needs (the same test as a fresh
    /// plan's low-volume warning) and the setback is what cost it. About 2% slower per 10% of the original peak lost,
    /// plus a little after illness or injury, rounded up to 10 s (5K, 10K) or a minute. A setback with time to build
    /// back keeps the goal: a lower peak that's still enough for the race isn't worth a slower target.
    /// </summary>
    private static TimeSpan? SuggestedGoal(PlanParameters p, PlanProfile profile, double originalPeakKm, double peakKm, Setback setback)
    {
        var shortfall = Math.Max(0, 1 - peakKm / originalPeakKm);
        if (peakKm >= UsualPeakKm(p, profile) * LowVolumeShare || shortfall < GoalRiskShortfall)
        {
            return null;
        }

        var slower = Math.Min(MaxGoalSlowdown, shortfall * GoalSlowdownPerShortfall + GoalPenalty(setback));
        var step = profile.Category is DistanceCategory.FiveK or DistanceCategory.TenK ? 10 : 60;
        var seconds = Math.Ceiling(Math.Round(p.GoalTime.TotalSeconds * (1 + slower)) / step) * step;
        return TimeSpan.FromSeconds(Math.Max(seconds, Math.Floor(p.GoalTime.TotalSeconds / step) * step + step));
    }

    private static string Clock(TimeSpan time) => time.TotalHours >= 1
        ? string.Create(CultureInfo.InvariantCulture, $"{(int)time.TotalHours}:{time.Minutes:00}:{time.Seconds:00}")
        : string.Create(CultureInfo.InvariantCulture, $"{time.Minutes}:{time.Seconds:00}");
}
