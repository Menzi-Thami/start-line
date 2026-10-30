namespace StartLine.Domain.Plans;

/// <summary>
/// Generator v2's per-distance shapes (see <see cref="PlanShape"/>): front-loaded volume growth that may level off
/// early, and a long run on a track of its own. Version 1 plans never come here.
/// </summary>
public static partial class TrainingPlanGenerator
{
    /// <summary>Plans built before the per-distance shapes, and every link or saved plan without a version.</summary>
    public const int OriginalVersion = 1;

    /// <summary>Per-distance shapes: front-loaded ramps, a long-run track, a real 10% limit.</summary>
    public const int ShapedVersion = 2;

    /// <summary>
    /// The version every new plan is built with. On top of version 2: long runs reach a floor for the half and the
    /// marathon, hard sessions are sized to the week, long tempos become reps, a short week keeps to two hard days, a new
    /// runner starts with two easy weeks, and strength stays off hard days and the eve of the long run.
    /// </summary>
    public const int LatestVersion = 3;

    // Version 3: the long run a half or a marathon should reach at its peak, as the classic plans agree (Pfitzinger,
    // Higdon, Hansons): about 16 km and 26 km. Still never past the time cap or half the week.
    private const double HalfLongRunFloorKm = 16;
    private const double MarathonLongRunFloorKm = 26;

    // Version 3: how much faster the long run may grow to reach its floor in time, over the distance's usual step.
    private const double FloorStepStretch = 1.5;

    private static bool IsV3(PlanParameters p) => p.GeneratorVersion >= LatestVersion;

    private static double LongRunFloorKm(PlanParameters p, PlanProfile profile) => !IsV3(p) ? 0 : profile.Category switch
    {
        DistanceCategory.HalfMarathon => HalfLongRunFloorKm,
        DistanceCategory.Marathon => MarathonLongRunFloorKm,
        _ => 0,
    };

    // A front-loaded build's last growth step is half the size of its first, until the build needs more than that: then
    // the early steps stay at 10% and the later ones grow towards it, so a build never reaches less than an even one would.
    private const double FinalStepShare = 0.5;

    // However its track runs, a long run is never more than half the week.
    private const double LongRunMaxShareOfWeek = 0.5;

    private static readonly double MaxWeeklyGrowth = MaxWeeklyIncrease - 1;

    /// <summary>
    /// Weekly volumes for a front-loaded build: the growth steps shrink from the first to the last, so most of the
    /// distance is added early and the weeks near the peak grow gently. A shape with a <see cref="PlanShape.RampShare"/>
    /// below 1 reaches the peak in that share of the build (or as soon after as it safely can) and then holds it.
    /// </summary>
    private static double[] FrontLoadedRamp(double startKm, double peakKm, int weeks, PlanShape shape)
    {
        var growthSteps = Math.Max(0, ProgressionWeeks(weeks, shape) - 1);

        // The fewest steps, from the shape's share of the build, that reach the peak without growing more than 10% a week.
        var steps = Math.Min(growthSteps, (int)Math.Ceiling(growthSteps * shape.RampShare));
        while (steps < growthSteps && Grown(startKm, GrowthWeights(steps), MaxGrowthRate) < peakKm)
        {
            steps++;
        }

        var weights = GrowthWeights(steps);
        var rate = GrowthRate(startKm, peakKm, weights);
        var volumes = new double[weeks];
        var step = 0;
        var lastProgression = startKm;
        for (var i = 0; i < weeks; i++)
        {
            if (IsCutback(i, weeks, shape))
            {
                volumes[i] = lastProgression * CutbackFactor;
                continue;
            }

            lastProgression = growthSteps == 0 ? peakKm
                : step == 0 ? startKm
                : step <= steps ? lastProgression * Growth(rate, weights[step - 1])
                : lastProgression;
            volumes[i] = lastProgression;
            step++;
        }

        return volumes;
    }

    /// <summary>The most a front-loaded build over this many weeks can reach: with every step at 10%, as much as an even build.</summary>
    private static double FrontLoadedReachableKm(double startKm, int weeks, PlanShape shape) =>
        Grown(startKm, GrowthWeights(Math.Max(0, ProgressionWeeks(weeks, shape) - 1)), MaxGrowthRate);

    // At this rate even the smallest step is 10%: every step is as big as it is allowed to be.
    private static double MaxGrowthRate => MaxWeeklyGrowth / FinalStepShare;

    /// <summary>Each growth step's share of the largest: 1 for the first, falling evenly to <see cref="FinalStepShare"/>.</summary>
    private static double[] GrowthWeights(int steps) =>
        [.. Enumerable.Range(0, steps).Select(k => steps == 1 ? 1 : 1 - (1 - FinalStepShare) * k / (steps - 1))];

    /// <summary>One week's growth: its share of the rate, but never more than 10%.</summary>
    private static double Growth(double rate, double weight) => 1 + Math.Min(MaxWeeklyGrowth, rate * weight);

    private static double Grown(double startKm, double[] weights, double rate) =>
        weights.Aggregate(startKm, (km, weight) => km * Growth(rate, weight));

    /// <summary>
    /// The growth rate that lands the build on <paramref name="peakKm"/>. Found by halving the interval, so it is the same
    /// on every machine, and it never overshoots the peak.
    /// </summary>
    private static double GrowthRate(double startKm, double peakKm, double[] weights)
    {
        if (weights.Length == 0 || startKm >= peakKm)
        {
            return 0;
        }

        double low = 0, high = MaxGrowthRate;
        for (var i = 0; i < 60; i++)
        {
            var middle = (low + high) / 2;
            if (Grown(startKm, weights, middle) < peakKm)
            {
                low = middle;
            }
            else
            {
                high = middle;
            }
        }

        return low;
    }

    /// <summary>
    /// The long run's own track for the half, marathon and ultra: it starts where the first week's volume puts it,
    /// steps up by the distance's <see cref="PlanProfile.LongRunStepKm"/>, holds for a week, steps up again, and so on
    /// until it reaches the long run the peak week would have. A cutback week runs a fifth shorter, and the track picks up
    /// after it. The distance and time caps still apply, and no long run is more than <see cref="LongRunMaxShareOfWeek"/>
    /// of its week's planned volume. Null when the shape has no track, so the long run follows the week's volume as it
    /// always did.
    /// </summary>
    private static double[]? LongRunTrack(
        PlanParameters p, PlanProfile profile, WorkoutBuilder workouts, PlanShape shape, double[] volumes, Func<int, bool> isCutback)
    {
        if (!shape.HasLongRunTrack || volumes.Length == 0)
        {
            return null;
        }

        var startKm = LongRunKm(p, profile, workouts, volumes[0]);
        var peakKm = Math.Min(Math.Max(LongRunKm(p, profile, workouts, volumes.Max()), LongRunFloorKm(p, profile)), LongRunCapKm(profile, workouts));
        var track = new double[volumes.Length];
        var fullWeeks = 0;
        var current = startKm;

        // Version 3: a floor above the usual peak may need a slightly bigger step to be reached before the taper.
        var stepKm = shape.LongRunStepKm;
        if (IsV3(p))
        {
            var steps = Math.Max(1, (Enumerable.Range(0, volumes.Length).Count(i => !isCutback(i)) + 1) / 2);
            stepKm = Math.Min(shape.LongRunStepKm * FloorStepStretch, Math.Max(stepKm, (peakKm - startKm) / steps));
        }

        for (var i = 0; i < volumes.Length; i++)
        {
            double km;
            if (isCutback(i))
            {
                km = current * CutbackFactor;
            }
            else
            {
                // Full weeks 1, 3, 5… step up; 2, 4, 6… hold.
                current = Math.Min(peakKm, startKm + stepKm * ((fullWeeks + 1) / 2));
                km = current;
                fullWeeks++;
            }

            track[i] = WorkoutBuilder.Round(Math.Max(MinLongRunKm, Math.Min(km, volumes[i] * LongRunMaxShareOfWeek)));
        }

        return track;
    }
}
