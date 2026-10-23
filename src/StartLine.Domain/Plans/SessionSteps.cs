using System.Collections;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public enum StepKind
{
    /// <summary>Easy running to get going before the work.</summary>
    WarmUp,

    /// <summary>The work itself, or the whole of a steady run.</summary>
    Run,

    /// <summary>Easy jogging or walking between efforts.</summary>
    Recover,

    /// <summary>Easy running to finish.</summary>
    CoolDown,

    /// <summary>A block of steps done <see cref="SessionStep.Times"/> times.</summary>
    Repeat,
}

/// <summary>
/// One step of a session, the way a runner follows it on the day: "2 km easy", "1 km at 4:58–5:10/km", "90 s jog". A step
/// is measured by distance or by time. <see cref="Pace"/> is the range to run it at, for that week's paces; where a pace on
/// a watch says little (hills, fartlek, strides, recoveries) <see cref="Effort"/> says how it should feel instead. A
/// <see cref="StepKind.Repeat"/> holds the <see cref="Block"/> to repeat <see cref="Times"/> times.
/// </summary>
public sealed record SessionStep(
    StepKind Kind,
    double? DistanceKm = null,
    TimeSpan? Duration = null,
    PaceZone? Zone = null,
    PaceRange? Pace = null,
    string? Effort = null,
    int Times = 1,
    SessionSteps? Block = null);

/// <summary>A session's steps, in order. Compared by value, so the same answers still give an equal plan.</summary>
public sealed class SessionSteps(IEnumerable<SessionStep> steps) : IReadOnlyList<SessionStep>, IEquatable<SessionSteps>
{
    private readonly SessionStep[] _steps = [.. steps];

    public SessionStep this[int index] => _steps[index];

    public int Count => _steps.Length;

    public IEnumerator<SessionStep> GetEnumerator() => ((IEnumerable<SessionStep>)_steps).GetEnumerator();

    IEnumerator IEnumerable.GetEnumerator() => _steps.GetEnumerator();

    public bool Equals(SessionSteps? other) => other is not null && _steps.SequenceEqual(other._steps);

    public override bool Equals(object? obj) => Equals(obj as SessionSteps);

    public override int GetHashCode() => _steps.Aggregate(0, (hash, step) => HashCode.Combine(hash, step));
}
