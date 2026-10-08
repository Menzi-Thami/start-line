namespace StartLine.Domain.Running;

/// <summary>
/// Training paces derived from a goal race. Rather than adding fixed seconds to goal pace (which
/// is wrong for every distance except one), each zone is anchored to an equivalent performance:
/// interval work sits between 3K and 5K pace, tempo between 10K and half-marathon pace, and the
/// aerobic zones are multiples of equivalent marathon pace.
/// </summary>
public static class TrainingPaces
{
    private static readonly Distance ThreeK = Distance.FromKilometres(3);

    public static IReadOnlyDictionary<PaceZone, PaceRange> FromGoal(Distance race, TimeSpan goalTime)
    {
        ArgumentNullException.ThrowIfNull(race);

        Pace Equivalent(Distance d) => RaceTimePredictor.EquivalentPace(race, goalTime, d);

        var marathon = Equivalent(Distance.Marathon);
        var goal = Pace.Of(race, goalTime);

        return new Dictionary<PaceZone, PaceRange>
        {
            [PaceZone.Recovery] = new(marathon.Scale(1.30), marathon.Scale(1.45)),
            [PaceZone.Easy] = new(marathon.Scale(1.15), marathon.Scale(1.30)),
            [PaceZone.LongRun] = new(marathon.Scale(1.10), marathon.Scale(1.22)),
            [PaceZone.Tempo] = new(Equivalent(Distance.TenK), Equivalent(Distance.HalfMarathon)),
            [PaceZone.Interval] = new(Equivalent(ThreeK), Equivalent(Distance.FiveK)),
            [PaceZone.Race] = new(goal, goal),
        };
    }
}
