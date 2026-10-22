namespace StartLine.Domain.Plans;

/// <summary>
/// How a plan grows week to week, by generator version. Version 1 is every plan built before the per-distance shapes
/// and must never change. Version 2 shapes each plan for its distance and runner:
/// <list type="bullet">
/// <item>volume grows in bigger steps early and flatter ones near the peak, never more than 10% a week;</item>
/// <item>5K and 10K volume levels off part-way through, and the hard sessions, still growing through each phase, carry
/// the progression from there;</item>
/// <item>half, marathon and ultra long runs follow their own track: a step up, then a week to hold it;</item>
/// <item>new runners cut back every third week instead of every fourth;</item>
/// <item>the 10% limit holds on the distance each week really adds up to, as it does in a replan.</item>
/// </list>
/// </summary>
/// <param name="CutbackEvery">Every this many weeks is a cutback week.</param>
/// <param name="FrontLoaded">Growth steps shrink towards the peak, instead of staying the same size.</param>
/// <param name="RampShare">The share of the build that volume grows over; after that it holds at the peak.</param>
/// <param name="LongRunStepKm">How far the long run steps up at a time on its own track. 0: it follows the week's volume.</param>
/// <param name="LimitsRealGrowth">
/// The 10% limit holds on each week's real (rounded) distance, not just its target, and a hard session gives way in a
/// week with no room for it, as in a replan.
/// </param>
internal sealed record PlanShape(
    int CutbackEvery, bool FrontLoaded, double RampShare, double LongRunStepKm, bool LimitsRealGrowth)
{
    public static readonly PlanShape Original =
        new(4, FrontLoaded: false, RampShare: 1, LongRunStepKm: 0, LimitsRealGrowth: false);

    // 5K and 10K reach their peak volume about three-fifths of the way through the build, then hold it.
    private const double ShortRaceRampShare = 0.6;

    public bool HasLongRunTrack => LongRunStepKm > 0;

    public static PlanShape For(PlanParameters parameters, PlanProfile profile)
    {
        if (parameters.GeneratorVersion == TrainingPlanGenerator.OriginalVersion)
        {
            return Original;
        }

        var shortRace = profile.Category is DistanceCategory.FiveK or DistanceCategory.TenK;
        return new(
            parameters.Experience == Experience.New ? 3 : 4,
            FrontLoaded: true,
            RampShare: shortRace ? ShortRaceRampShare : 1,
            LongRunStepKm: profile.LongRunStepKm,
            LimitsRealGrowth: true);
    }
}
