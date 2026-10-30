using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>
/// Whether a plan uses run/walk on its long runs and on race day. Auto decides from the goal (see
/// <see cref="RunWalkRules"/>); On and Off are the runner's own choice, for any distance.
/// </summary>
public enum RunWalkMode
{
    Auto,
    On,
    Off,
}

/// <summary>Run for <see cref="RunSeconds"/>, walk for <see cref="WalkSeconds"/>, and repeat from the start of the run.</summary>
public sealed record RunWalkRatio(int RunSeconds, int WalkSeconds)
{
    public TimeSpan Run => TimeSpan.FromSeconds(RunSeconds);

    public TimeSpan Walk => TimeSpan.FromSeconds(WalkSeconds);

    /// <summary>"run 4 min, walk 30 s", for a session's detail.</summary>
    public string Describe() => $"run {Words(Run)}, walk {Words(Walk)}";

    private static string Words(TimeSpan time) => (time.Minutes, time.Seconds) switch
    {
        (0, var s) => $"{s} s",
        (var m, 0) => $"{m} min",
        (var m, var s) => $"{m} min {s} s",
    };
}

/// <summary>
/// Galloway-style run/walk for everyday and slower runners: regular short walk breaks from the very start, so the legs
/// last the distance. Only version 3 plans and later use it; older plans are exactly as they were built.
/// </summary>
public static class RunWalkRules
{
    // Auto turns run/walk on for goals where most runners walk anyway, and where planned breaks beat forced ones: an ultra
    // of 10 hours or more, or a marathon of 5 h 30 min or slower.
    public static readonly TimeSpan UltraGoalForRunWalk = TimeSpan.FromHours(10);
    public static readonly TimeSpan MarathonGoalForRunWalk = new(5, 30, 0);

    // The ratio follows the runner's long-run pace, after Jeff Galloway's run/walk/run ratios (his pace-per-mile table,
    // converted to per km and simplified to four bands): the slower the pace, the shorter the run between 30 s walks.
    private const int WalkSeconds = 30;
    private const double FasterBandSecondsPerKm = 6 * 60 + 30;   // faster than 6:30/km: run 8 min
    private const double MiddleBandSecondsPerKm = 7 * 60 + 30;   // 6:30 to 7:30/km: run 4 min
    private const double SlowerBandSecondsPerKm = 8 * 60 + 30;   // 7:30 to 8:30/km: run 2 min 30 s; slower: run 1 min
    private const int FastRunSeconds = 8 * 60;
    private const int MiddleRunSeconds = 4 * 60;
    private const int SlowerRunSeconds = 2 * 60 + 30;
    private const int SlowestRunSeconds = 60;

    /// <summary>Whether <paramref name="p"/>'s plan runs and walks. Always off before version 3, whatever was asked.</summary>
    public static bool IsOn(PlanParameters p, DistanceCategory category)
    {
        ArgumentNullException.ThrowIfNull(p);
        if (p.GeneratorVersion < TrainingPlanGenerator.LatestVersion)
        {
            return false;
        }

        return p.RunWalk switch
        {
            RunWalkMode.On => true,
            RunWalkMode.Off => false,
            _ => category switch
            {
                DistanceCategory.Ultra or DistanceCategory.LongUltra => p.GoalTime >= UltraGoalForRunWalk,
                DistanceCategory.Marathon => p.GoalTime >= MarathonGoalForRunWalk,
                _ => false,
            },
        };
    }

    /// <summary>The run/walk ratio for a runner whose long runs are at <paramref name="longRunPace"/>.</summary>
    public static RunWalkRatio For(Pace longRunPace)
    {
        ArgumentNullException.ThrowIfNull(longRunPace);
        var secondsPerKm = longRunPace.SecondsPerKilometre;
        var run = secondsPerKm switch
        {
            < FasterBandSecondsPerKm => FastRunSeconds,
            < MiddleBandSecondsPerKm => MiddleRunSeconds,
            < SlowerBandSecondsPerKm => SlowerRunSeconds,
            _ => SlowestRunSeconds,
        };
        return new RunWalkRatio(run, WalkSeconds);
    }
}
