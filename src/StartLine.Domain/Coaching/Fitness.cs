using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Coaching;

/// <summary>A stretch of a run timed over a known distance: one of a run's best efforts.</summary>
public sealed record Effort(DateOnly Date, double DistanceMetres, TimeSpan Elapsed);

/// <summary>
/// What the runner could race today. From recorded runs: the best recent effort, carried to the race distance with
/// Riegel's model. Without them: a nudge to the paces from how hard sessions have felt. Every threshold is a named
/// constant with a test.
/// </summary>
public static class Fitness
{
    /// <summary>Efforts from the last six weeks count; older ones say more about the past than today.</summary>
    public const int WindowDays = 42;

    /// <summary>Shorter efforts flatter a longer race too much to predict it.</summary>
    public const double ShortestEffortMetres = 3000;

    /// <summary>Each week since an effort makes its prediction this much slower: fitness fades a little.</summary>
    public const double AgeingPerWeek = 0.0025;

    /// <summary>Hard sessions that all felt much harder than they should slow the paces by this much.</summary>
    public const double SlowerStep = 1.02;

    /// <summary>Hard sessions that all felt much easier than they should quicken the paces by this much.</summary>
    public const double QuickerStep = 0.99;

    /// <summary>However the sessions feel, the paces stay within this of the goal's until a run shows otherwise.</summary>
    public const double MinPaceFactor = 0.97;
    public const double MaxPaceFactor = 1.08;

    /// <summary>The race time the best recent effort points to, or null without a long enough effort.</summary>
    public static TimeSpan? Estimate(Distance race, DateOnly asOf, IEnumerable<Effort> efforts)
    {
        ArgumentNullException.ThrowIfNull(race);
        ArgumentNullException.ThrowIfNull(efforts);
        var predictions = efforts
            .Where(e => e.Date < asOf && e.Date >= asOf.AddDays(-WindowDays) && e.DistanceMetres >= ShortestEffortMetres && e.Elapsed > TimeSpan.Zero)
            .Select(e =>
            {
                var predicted = RaceTimePredictor.Predict(Distance.FromKilometres(e.DistanceMetres / 1000), e.Elapsed, race);
                var weeksOld = (asOf.DayNumber - e.Date.DayNumber) / 7;
                return predicted.TotalSeconds * (1 + weeksOld * AgeingPerWeek);
            })
            .ToList();
        return predictions.Count == 0 ? null : TimeSpan.FromSeconds(Math.Round(predictions.Min()));
    }

    /// <summary>
    /// For a runner without recorded runs: when every hard session last week felt much harder than it should, the paces
    /// ease; when every one felt much easier, they quicken a little. Otherwise they stay where they were.
    /// </summary>
    public static double PaceFactor(double previous, IReadOnlyList<RunEvidence> lastWeek)
    {
        ArgumentNullException.ThrowIfNull(lastWeek);
        var rated = lastWeek
            .Where(e => e.CompletedAsPlanned && ExpectedEffort.IsHard(e.Session.Type) && e.CheckIn?.Effort is not null && ExpectedEffort.For(e.Session.Type) is not null)
            .Select(e => (Effort: e.CheckIn!.Effort!.Value, Expected: ExpectedEffort.For(e.Session.Type)!.Value))
            .ToList();
        if (rated.Count == 0)
        {
            return previous;
        }

        var factor = rated.All(r => r.Effort >= r.Expected.High + WeeklyCoach.FeltHarderBy) ? previous * SlowerStep
            : rated.All(r => r.Effort <= r.Expected.Low - WeeklyCoach.FeltEasierBy) ? previous * QuickerStep
            : previous;
        return Math.Round(Math.Clamp(factor, MinPaceFactor, MaxPaceFactor), 4);
    }
}
