using System.Globalization;
using StartLine.Domain.Coaching;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public static partial class TrainingPlanGenerator
{
    // How much of its race time a full build can take off, by experience. A newer runner has more to gain.
    private const double NewRunnerGain = 0.08;
    private const double RegularRunnerGain = 0.05;
    private const double ExperiencedRunnerGain = 0.03;

    // Weeks of building that earn the whole gain; fewer weeks earn a share of it.
    private const int FullBuildWeeks = 12;

    // How much of the available gain a goal asks for: up to half is realistic, up to all of it a stretch, more is at risk.
    private const double OnTrackShareOfGain = 0.5;
    private const double StretchShareOfGain = 1.0;

    // A more realistic goal for a runner whose goal is at risk asks for this share of the gain.
    private const double RealisticGoalShareOfGain = 0.6;

    /// <summary>
    /// The coach's read on the goal as of <paramref name="asOf"/>: is it realistic, and why. One plan never gives two
    /// verdicts on the same goal, so this defers to what already judges one and adds a read only where nothing has:
    /// <list type="bullet">
    /// <item>A rebuild's own call: <see cref="TrainingPlan.SuggestedGoal"/> slower than the goal (it cost more training than
    /// there is time to win back) is <see cref="GoalVerdict.AtRisk"/>, with that very goal.</item>
    /// <item>The coach's: <see cref="TrainingPlan.SuggestedGoal"/> faster than the goal (three strong weeks) is
    /// <see cref="GoalVerdict.AheadOfGoal"/>, with that very goal. Recorded runs never say it sooner.</item>
    /// <item>A fresh plan's <c>low-volume</c> warning, which the plan's own shape decides: the build is never better than a stretch.</item>
    /// <item>Otherwise, the runner's fitness against the goal: the coach's estimate from recorded runs, or a
    /// <paramref name="recent"/> result they gave (judged by the same <see cref="Fitness"/> and Riegel as the coach).</item>
    /// </list>
    /// Nothing here changes the plan.
    /// </summary>
    public static GoalOutlook AssessGoal(PlanParameters p, TrainingPlan plan, DateOnly asOf, RecentResult? recent = null)
    {
        ArgumentNullException.ThrowIfNull(p);
        ArgumentNullException.ThrowIfNull(plan);

        var profile = PlanProfile.For(p.RaceDistance);
        var calls = (p.Coaching ?? []).OrderBy(c => c.WeekStart).ToList();
        var adjusted = p.Replan is not null || calls.Any(c => c.ChangesThePlan);
        var asWritten = p.Replan is null && p.Coaching is null ? plan : Generate(p with { Replan = null, Coaching = null });

        var peakKm = BuildingPeakKm(plan);
        var writtenPeakKm = BuildingPeakKm(asWritten);
        var usualPeakKm = UsualPeakKm(p, profile);
        var kept = writtenPeakKm > 0 ? Math.Min(1, peakKm / writtenPeakKm) : 1;
        var buildWeeksLeft = plan.Weeks.Count(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak && w.StartDate.AddDays(6) >= asOf);
        var gain = GainFor(p.Experience) * Math.Min(1, buildWeeksLeft / (double)FullBuildWeeks) * kept;

        // The generator's own call, which the plan's own shape decides (a rebuild drops it and makes its own call below).
        var lowVolume = p.Replan is null && plan.Warnings.Any(w => w.Code == "low-volume");

        var reasons = new List<OutlookReason>();
        if (p.Replan is { } replan)
        {
            reasons.Add(new("replanned",
                $"After {Describe(replan.Setback)}, the rest of the plan was rebuilt from {replan.From.ToString("d MMMM", CultureInfo.InvariantCulture)}. " +
                $"{WeeksLeft(plan, asOf)} to race day."));
        }

        var changed = calls.Count(c => c.ChangesThePlan);
        if (changed > 0)
        {
            reasons.Add(new("coach-adjusted",
                $"The coach has changed {changed} {(changed == 1 ? "week" : "weeks")} so far to keep your training sustainable."));
        }

        reasons.Add(BuildReason(profile, peakKm, writtenPeakKm, usualPeakKm, adjusted, lowVolume));

        GoalVerdict verdict;
        TimeSpan? suggested = null;
        TimeSpan? fitness = null;
        var reliable = profile.Category is not (DistanceCategory.Ultra or DistanceCategory.LongUltra);

        if (p.Replan is not null && plan.SuggestedGoal is { } slower && slower > p.GoalTime)
        {
            // The rebuild's own call: there isn't time to win back the training the setback cost.
            (verdict, suggested) = (GoalVerdict.AtRisk, slower);
            reasons.Add(new("lost-training", "There isn't time to win back all the training you lost before race day."));
        }
        else if (plan.SuggestedGoal is { } faster && faster < p.GoalTime)
        {
            // The coach's own call: three strong weeks, and fitness has run ahead of the goal.
            (verdict, suggested) = (GoalVerdict.AheadOfGoal, faster);
            reasons.Add(new("three-strong-weeks", $"Three strong weeks, and your recent runs point to about {Clock(faster)}."));
        }
        else
        {
            // What the runner could race today: the coach's estimate from recorded runs, else a result they gave us.
            var recorded = calls.LastOrDefault(c => c.Fitness is not null)?.Fitness;
            fitness = recorded;
            var evidence = recorded is null ? null : "recent runs";
            if (fitness is null && recent is not null)
            {
                fitness = Fitness.Estimate(p.RaceDistance, asOf.AddDays(1), [new Effort(recent.Date, recent.Distance.Kilometres * 1000, recent.Time)]);
                evidence = $"{Kilometres(recent.Distance.Kilometres)} in {Clock(recent.Time)}";
                if (fitness is null)
                {
                    reasons.Add(new("result-too-old",
                        $"That result can't be used: it needs to be at least {Fitness.ShortestEffortMetres / 1000:0} km and from the last {Fitness.WindowDays / 7} weeks."));
                }
            }

            GoalVerdict? read = null;
            if (!reliable)
            {
                fitness = null;
                reasons.Add(new("ultra-prediction",
                    "Race-time predictions are least reliable beyond the marathon, so this looks at the build, not the time itself."));
            }
            else if (fitness is { } today)
            {
                // Recorded runs never say "aim higher" sooner than the coach does; a result given on day one can, as no coach has spoken yet.
                (read, suggested) = PaceVerdict(p, profile, today, gain, evidence!, buildWeeksLeft, canAimHigher: recorded is null, reasons);
            }
            else if (recent is null && !adjusted)
            {
                reasons.Add(new("no-result",
                    $"Add a recent race or hard effort (at least {Fitness.ShortestEffortMetres / 1000:0} km, from the last {Fitness.WindowDays / 7} weeks) " +
                    $"and I can tell you whether {Clock(p.GoalTime)} is realistic, or whether you could aim higher."));
            }

            verdict = read ?? (adjusted ? GoalVerdict.OnTrack : GoalVerdict.NotAssessed);
        }

        // Speed over a shorter distance doesn't make up for a build that can't reach the volume the race needs.
        if (lowVolume && verdict is GoalVerdict.AheadOfGoal or GoalVerdict.OnTrack or GoalVerdict.NotAssessed)
        {
            (verdict, suggested) = (GoalVerdict.Stretch, null);
        }

        return new GoalOutlook(verdict, Summary(verdict, p.GoalTime, suggested, adjusted, lowVolume), reasons, verdict is GoalVerdict.AheadOfGoal or GoalVerdict.AtRisk ? suggested : null, fitness);
    }

    private static (GoalVerdict Verdict, TimeSpan? Suggested) PaceVerdict(
        PlanParameters p, PlanProfile profile, TimeSpan fitness, double gain, string evidence, int buildWeeksLeft, bool canAimHigher, List<OutlookReason> reasons)
    {
        var need = (fitness.TotalSeconds - p.GoalTime.TotalSeconds) / fitness.TotalSeconds;
        var reach = TimeSpan.FromSeconds(fitness.TotalSeconds * (1 - gain));

        reasons.Add(new("fitness-today",
            $"Your {evidence} points to about {Clock(fitness)} for this race today. " +
            $"{Clock(p.GoalTime)} is {Percent(Math.Abs(need))} {(need >= 0 ? "faster" : "slower")} than that."));
        if (gain > 0.001)
        {
            reasons.Add(new("training-gain",
                $"With {buildWeeksLeft} {(buildWeeksLeft == 1 ? "week" : "weeks")} of building left, runners like you typically gain up to about {Percent(gain)}, " +
                $"which would take you towards {Clock(reach)}."));
        }

        // The coach's own test and rounding for "fitter than the goal": a faster goal is what the runner could run today.
        if (need <= -FasterGoalMargin)
        {
            var higher = RoundedGoal(fitness, profile);
            return canAimHigher && higher < p.GoalTime ? (GoalVerdict.AheadOfGoal, higher) : (GoalVerdict.OnTrack, null);
        }

        var share = gain <= 0.001 ? (need > 0 ? double.PositiveInfinity : 0) : Math.Max(0, need) / gain;
        if (share <= OnTrackShareOfGain)
        {
            return (GoalVerdict.OnTrack, null);
        }

        if (share <= StretchShareOfGain)
        {
            return (GoalVerdict.Stretch, null);
        }

        var realistic = RoundedUp(TimeSpan.FromSeconds(fitness.TotalSeconds * (1 - gain * RealisticGoalShareOfGain)), profile);
        return (GoalVerdict.AtRisk, realistic > p.GoalTime ? realistic : null);
    }

    private static OutlookReason BuildReason(PlanProfile profile, double peakKm, double writtenPeakKm, double usualPeakKm, bool adjusted, bool lowVolume)
    {
        var race = Label(profile.Category);
        var share = Percent(usualPeakKm <= 0 ? 1 : peakKm / usualPeakKm);
        if (lowVolume)
        {
            return new("build-thin",
                $"Building safely from where you are can't reach the {Km(usualPeakKm)} a week a {race} usually needs in the time left. " +
                "More weeks or a more forgiving goal would help.");
        }

        if (adjusted && writtenPeakKm > 0 && peakKm < writtenPeakKm * 0.95)
        {
            return new("build-kept",
                $"The plan now builds to {Km(peakKm)} a week, {Percent(peakKm / writtenPeakKm)} of the {Km(writtenPeakKm)} it was first written for. " +
                $"That's {share} of the {Km(usualPeakKm)} a {race} usually needs.");
        }

        return adjusted
            ? new("build-kept", $"The changes barely touch your peak: the plan still builds to {Km(peakKm)} a week, enough for a {race}.")
            : new("build-enough", $"The plan builds to {Km(peakKm)} a week at its peak, {share} of the {Km(usualPeakKm)} a {race} usually needs: enough.");
    }

    private static string Summary(GoalVerdict verdict, TimeSpan goal, TimeSpan? suggested, bool adjusted, bool lowVolume) => verdict switch
    {
        GoalVerdict.AheadOfGoal =>
            $"You look fitter than {Clock(goal)} asks for. Around {Clock(suggested!.Value)} looks achievable: aim for it if you'd like the plan to ask more of you.",
        GoalVerdict.OnTrack when adjusted => $"{Clock(goal)} is still realistic after the changes.",
        GoalVerdict.OnTrack => $"{Clock(goal)} looks realistic for this race.",
        GoalVerdict.Stretch => $"{Clock(goal)} is a stretch: possible, but it needs most of the training to go to plan.",
        GoalVerdict.AtRisk when suggested is { } realistic =>
            $"{Clock(goal)} is unlikely on this plan. {Clock(realistic)} is a more realistic goal. Your plan keeps your goal until you change it.",
        GoalVerdict.AtRisk => $"{Clock(goal)} is unlikely on this plan. More weeks, or a more forgiving goal, would help.",
        _ when lowVolume => $"The plan is built for {Clock(goal)}, but the build is thin for this race.",
        _ => $"The plan is built for {Clock(goal)} and has the time and distance this race needs. Add a recent result and I can tell you whether the time itself is realistic.",
    };

    private static double GainFor(Experience experience) => experience switch
    {
        Experience.New => NewRunnerGain,
        Experience.Experienced => ExperiencedRunnerGain,
        _ => RegularRunnerGain,
    };

    private static double BuildingPeakKm(TrainingPlan plan) =>
        plan.Weeks.Where(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak).Select(w => w.PlannedKm).DefaultIfEmpty().Max();

    /// <summary>A slower goal rounded up the way a rebuild's is (<see cref="SuggestedGoal"/>): to 10 s for a 5K or 10K, to the minute beyond.</summary>
    private static TimeSpan RoundedUp(TimeSpan time, PlanProfile profile)
    {
        var step = profile.Category is DistanceCategory.FiveK or DistanceCategory.TenK ? 10 : 60;
        return TimeSpan.FromSeconds(Math.Ceiling(time.TotalSeconds / step) * step);
    }

    private static string WeeksLeft(TrainingPlan plan, DateOnly asOf)
    {
        var weeks = plan.Weeks.Count(w => w.StartDate.AddDays(6) >= asOf);
        return $"{weeks} {(weeks == 1 ? "week remains" : "weeks remain")}";
    }

    private static string Describe(Setback setback) => setback switch
    {
        Setback.Illness => "illness",
        Setback.Injury => "injury",
        Setback.Behind => "running less than planned",
        _ => "missed training",
    };

    private static string Label(DistanceCategory category) => category switch
    {
        DistanceCategory.FiveK => "5K",
        DistanceCategory.TenK => "10K",
        DistanceCategory.HalfMarathon => "half marathon",
        DistanceCategory.Marathon => "marathon",
        DistanceCategory.Ultra => "ultra",
        _ => "long ultra",
    };

    private static string Percent(double fraction) => string.Create(CultureInfo.InvariantCulture, $"{Math.Round(fraction * 100, fraction < 0.1 ? 1 : 0)}%");

    private static string Km(double km) => string.Create(CultureInfo.InvariantCulture, $"{Math.Round(km)} km");

    private static string Kilometres(double km) => string.Create(CultureInfo.InvariantCulture, $"{Math.Round(km, 1)} km");
}
