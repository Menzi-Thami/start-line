using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public enum WorkShape
{
    /// <summary>One effort the whole way: easy runs, long runs, races.</summary>
    Steady,

    /// <summary>Easy running around one continuous block of harder work: tempo, a fast finish, a race-pace middle.</summary>
    Continuous,

    /// <summary>Repeats with jogs between: intervals, cruise intervals, race-pace reps.</summary>
    Reps,

    /// <summary>Run by feel or on hills, where pace on a watch says little: fartlek, hill repeats.</summary>
    ByEffort,
}

/// <summary>
/// What a session asks for in a form a run can be judged against: how much of it is the real work, and at
/// which pace. The rest of a structured session is warm-up and cool-down at easy pace.
/// </summary>
public sealed record SessionStructure(WorkShape Shape, double WorkKm = 0, PaceZone? WorkZone = null, double? RepMetres = null)
{
    public static readonly SessionStructure Steady = new(WorkShape.Steady);

    public static SessionStructure Continuous(double workKm, PaceZone zone) => new(WorkShape.Continuous, workKm, zone);

    public static SessionStructure Reps(int count, double repMetres, PaceZone zone) =>
        new(WorkShape.Reps, count * repMetres / 1000, zone, repMetres);

    public static readonly SessionStructure ByEffort = new(WorkShape.ByEffort);
}
