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

    // A goal this much slower than today's fitness is one the runner could beat.
    private const double AheadOfGoalMargin = 0.03;

    // How much of the available gain a goal asks for: up to half is realistic, up to all of it a stretch, more is at risk.
    private const double OnTrackShareOfGain = 0.5;
    private const double StretchShareOfGain = 1.0;

    // A suggested goal asks for this share of the gain: a higher goal for a runner ahead of theirs, a lower one at risk.
    private const double HigherGoalShareOfGain = 0.5;
    private const double RealisticGoalShareOfGain = 0.6;

    /// <summary>
    /// The coach's read on the goal as of <paramref name="asOf"/>: is it realistic, and why. It looks at the plan as it
    /// stands (after any replan or coach calls) against the plan as first written, and at what's known about the runner's
    /// fitness: the coach's estimate from recorded runs, or a <paramref name="recent"/> result they gave. With neither,
    /// only the build can be judged. Nothing here changes the plan.
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
        // The generator's own call that the runner can't safely build to what the race needs from where they are; a plan's
        // peak can't say it (hard sessions have a set length, so a low-volume week can add up to more than its target).
        var lowVolume = plan.Warnings.Any(w => w.Code == "low-volume") || asWritten.Warnings.Any(w => w.Code == "low-volume");
        var thin = lowVolume || peakKm < usualPeakKm * LowVolumeShare;
        var kept = writtenPeakKm > 0 ? Math.Min(1, peakKm / writtenPeakKm) : 1;
        var buildWeeksLeft = plan.Weeks.Count(w => w.Phase is TrainingPhase.Base or TrainingPhase.Build or TrainingPhase.Peak && w.StartDate.AddDays(6) >= asOf);
        var gain = GainFor(p.Experience) * Math.Min(1, buildWeeksLeft / (double)FullBuildWeeks) * kept;

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

        reasons.Add(BuildReason(profile, peakKm, writtenPeakKm, usualPeakKm, adjusted, thin, lowVolume));

        // What the runner could race today: the coach's estimate from recorded runs, else a result they gave us.
        var reliable = profile.Category is not (DistanceCategory.Ultra or DistanceCategory.LongUltra);
        var fitness = calls.LastOrDefault(c => c.Fitness is not null)?.Fitness;
        string? evidence = fitness is null ? null : "recent runs";
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

        GoalVerdict? paceVerdict = null;
        TimeSpan? suggested = null;
        if (!reliable)
        {
            fitness = null;
            reasons.Add(new("ultra-prediction",
                "Race-time predictions are least reliable beyond the marathon, so this looks at the build, not the time itself."));
        }
        else if (fitness is { } today)
        {
            (paceVerdict, suggested) = PaceVerdict(p, profile, today, gain, evidence!, buildWeeksLeft, reasons);
        }
        else if (recent is null && !adjusted)
        {
            reasons.Add(new("no-result",
                $"Add a recent race or hard effort (at least {Fitness.ShortestEffortMetres / 1000:0} km, from the last {Fitness.WindowDays / 7} weeks) " +
                $"and I can tell you whether {Clock(p.GoalTime)} is realistic, or whether you could aim higher."));
        }

        // The replan's own call on the goal: it knows how much training the setback cost.
        var replanRisk = p.Replan is not null && plan.SuggestedGoal is { } slower && slower > p.GoalTime;
        var verdict = paceVerdict ?? (adjusted ? GoalVerdict.OnTrack : GoalVerdict.NotAssessed);
        if (replanRisk)
        {
            verdict = GoalVerdict.AtRisk;
            suggested = suggested is { } own && own > plan.SuggestedGoal ? own : plan.SuggestedGoal;
        }
        else if (paceVerdict is null && plan.SuggestedGoal is { } faster && faster < p.GoalTime)
        {
            verdict = GoalVerdict.AheadOfGoal;
            suggested = faster;
        }

        // Speed over a shorter distance doesn't make up for a build that can't reach the volume the race needs.
        if (thin && verdict is GoalVerdict.AheadOfGoal or GoalVerdict.OnTrack or GoalVerdict.NotAssessed)
        {
            (verdict, suggested) = (GoalVerdict.Stretch, null);
        }

        return new GoalOutlook(verdict, Summary(verdict, p.GoalTime, suggested, adjusted, thin), reasons, verdict is GoalVerdict.AheadOfGoal or GoalVerdict.AtRisk ? suggested : null, fitness);
    }

    private static (GoalVerdict Verdict, TimeSpan? Suggested) PaceVerdict(
        PlanParameters p, PlanProfile profile, TimeSpan fitness, double gain, string evidence, int buildWeeksLeft, List<OutlookReason> reasons)
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

        if (need <= -AheadOfGoalMargin)
        {
            var higher = RoundedTo(TimeSpan.FromSeconds(fitness.TotalSeconds * (1 - gain * HigherGoalShareOfGain)), profile, up: false);
            return higher < p.GoalTime ? (GoalVerdict.AheadOfGoal, higher) : (GoalVerdict.OnTrack, null);
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

        var realistic = RoundedTo(TimeSpan.FromSeconds(fitness.TotalSeconds * (1 - gain * RealisticGoalShareOfGain)), profile, up: true);
        return (GoalVerdict.AtRisk, realistic > p.GoalTime ? realistic : null);
    }

    private static OutlookReason BuildReason(PlanProfile profile, double peakKm, double writtenPeakKm, double usualPeakKm, bool adjusted, bool thin, bool lowVolume)
    {
        var race = Label(profile.Category);
        var share = Percent(usualPeakKm <= 0 ? 1 : peakKm / usualPeakKm);
        if (lowVolume)
        {
            return new("build-thin",
                $"Building safely from where you are can't reach the {Km(usualPeakKm)} a week a {race} usually needs in the time left. " +
                "More weeks or a more forgiving goal would help.");
        }

        if (thin)
        {
            return new("build-thin",
                $"The plan only reaches {Km(peakKm)} a week at its peak, {share} of the {Km(usualPeakKm)} a {race} usually needs. " +
                "Building safely from where you are can't get further in the time left; more weeks or a more forgiving goal would help.");
        }

        if (adjusted && writtenPeakKm > 0 && peakKm < writtenPeakKm * 0.95)
        {
            return new("build-kept",
                $"The plan now builds to {Km(peakKm)} a week, {Percent(peakKm / writtenPeakKm)} of the {Km(writtenPeakKm)} it was first written for. " +
                $"That's still {share} of the {Km(usualPeakKm)} a {race} usually needs.");
        }

        return adjusted
            ? new("build-kept", $"The changes barely touch your peak: the plan still builds to {Km(peakKm)} a week, enough for a {race}.")
            : new("build-enough", $"The plan builds to {Km(peakKm)} a week at its peak, {share} of the {Km(usualPeakKm)} a {race} usually needs: enough.");
    }

    private static string Summary(GoalVerdict verdict, TimeSpan goal, TimeSpan? suggested, bool adjusted, bool thin) => verdict switch
    {
        GoalVerdict.AheadOfGoal =>
            $"You look fitter than {Clock(goal)} asks for. Around {Clock(suggested!.Value)} looks achievable: aim for it if you'd like the plan to ask more of you.",
        GoalVerdict.OnTrack when adjusted => $"{Clock(goal)} is still realistic after the changes.",
        GoalVerdict.OnTrack => $"{Clock(goal)} looks realistic for this race.",
        GoalVerdict.Stretch => $"{Clock(goal)} is a stretch: possible, but it needs most of the training to go to plan.",
        GoalVerdict.AtRisk when suggested is { } realistic =>
            $"{Clock(goal)} is unlikely on this plan. {Clock(realistic)} is a more realistic goal. Your plan keeps your goal until you change it.",
        GoalVerdict.AtRisk => $"{Clock(goal)} is unlikely on this plan. More weeks, or a more forgiving goal, would help.",
        _ when thin => $"The plan is built for {Clock(goal)}, but the build is thin for this race.",
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

    /// <summary>A goal rounded the way runners say them: to 10 s for a 5K or 10K, to the minute beyond; up or down as asked.</summary>
    private static TimeSpan RoundedTo(TimeSpan time, PlanProfile profile, bool up)
    {
        var step = profile.Category is DistanceCategory.FiveK or DistanceCategory.TenK ? 10 : 60;
        var steps = time.TotalSeconds / step;
        return TimeSpan.FromSeconds((up ? Math.Ceiling(steps) : Math.Floor(steps)) * step);
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
