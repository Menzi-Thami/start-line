using StartLine.Domain.Plans;

namespace StartLine.Domain.Activities;

/// <summary>Observed prescription windows, aligned to recording start; not a runner's completion answer.</summary>
public sealed record WorkoutExecution(IReadOnlyList<StageExecution> Stages)
{
    public const int MaximumSampleGapSeconds = 15;
    public const int MaximumInitialSeconds = 5;
    public const int MaximumInitialMetres = 20;
    public const int PaceWindowSeconds = 10;
    public const int MaximumStages = 200;

    public static WorkoutExecution? Assess(IReadOnlyList<ActivitySample> samples, IReadOnlyList<SessionStep> prescription)
    {
        ArgumentNullException.ThrowIfNull(samples);
        ArgumentNullException.ThrowIfNull(prescription);
        var ordered = samples.OrderBy(sample => sample.Elapsed).ToArray();
        if (ordered.Length < 3 || ordered.Any(sample => !double.IsFinite(sample.DistanceMetres) || sample.DistanceMetres < 0 || sample.Elapsed < TimeSpan.Zero))
        {
            return null;
        }

        if (ordered[0].Elapsed.TotalSeconds > MaximumInitialSeconds || ordered[0].DistanceMetres > MaximumInitialMetres)
        {
            return null;
        }

        for (var i = 1; i < ordered.Length; i++)
        {
            var seconds = (ordered[i].Elapsed - ordered[i - 1].Elapsed).TotalSeconds;
            var metres = ordered[i].DistanceMetres - ordered[i - 1].DistanceMetres;
            if (seconds <= 0 || seconds > MaximumSampleGapSeconds || metres < -5 || metres / seconds > 12)
            {
                return null;
            }
        }

        var steps = new List<SessionStep>();
        if (!Expand(prescription, steps, 0) || steps.Count == 0)
        {
            return null;
        }

        var track = Track.From(ordered);
        var cursor = 0d;
        var elapsedCursor = 0d;
        var stages = new List<StageExecution>();
        foreach (var step in steps)
        {
            var start = cursor;
            var startMoving = track.MovingSecondsAt(start);
            var timedRecovery = step.Kind == StepKind.Recover && step.Duration is not null;
            var requestedEnd = step.DistanceKm is { } km ? start + km * 1000
                : timedRecovery ? track.MetresAtElapsedSeconds(elapsedCursor + step.Duration!.Value.TotalSeconds)
                : track.MetresAtMovingSeconds(startMoving + step.Duration!.Value.TotalSeconds);
            cursor = Math.Min(track.TotalMetres, requestedEnd);
            var moving = Math.Max(0, track.MovingSecondsAt(cursor) - startMoving);
            var endElapsed = timedRecovery ? Math.Min(track.ElapsedSeconds, elapsedCursor + step.Duration!.Value.TotalSeconds)
                : cursor > start ? track.FirstElapsedAt(cursor) : elapsedCursor;
            var elapsed = Math.Max(0, endElapsed - elapsedCursor);
            var observedSeconds = timedRecovery ? elapsed : moving;
            var coverage = step.DistanceKm is { } distance ? (cursor - start) / (distance * 1000)
                : observedSeconds / step.Duration!.Value.TotalSeconds;
            var pace = cursor > start && moving > 0 ? moving * 1000 / (cursor - start) : (double?)null;
            var fastest = step.Pace?.Fastest.SecondsPerKilometre;
            var slowest = step.Pace?.Slowest.SecondsPerKilometre;
            double? inTarget = null;
            if (fastest is { } fast && slowest is { } slow && moving >= PaceWindowSeconds)
            {
                var windows = 0;
                var matched = 0;
                for (var t = startMoving; t + PaceWindowSeconds <= startMoving + moving; t += PaceWindowSeconds)
                {
                    var metres = track.MetresAtMovingSeconds(t + PaceWindowSeconds) - track.MetresAtMovingSeconds(t);
                    if (metres <= 0) continue;
                    windows++;
                    var windowPace = PaceWindowSeconds * 1000 / metres;
                    if (windowPace >= fast - Math.Max(5, fast * .05) && windowPace <= slow + Math.Max(5, slow * .05)) matched++;
                }

                if (windows > 0) inTarget = (double)matched / windows;
            }

            stages.Add(new StageExecution(stages.Count + 1, step.Kind,
                step.DistanceKm is { } plannedKm ? plannedKm * 1000 : null, step.Duration?.TotalSeconds,
                Math.Round(cursor - start, 1), Math.Round(moving, 1), Math.Round(elapsed, 1), Math.Round(Math.Clamp(coverage, 0, 1), 3),
                pace is { } measured ? Math.Round(measured, 1) : null, fastest, slowest,
                inTarget is { } share ? Math.Round(share, 3) : null));
            elapsedCursor = endElapsed;
        }

        return new WorkoutExecution(stages);
    }

    private static bool Expand(IReadOnlyList<SessionStep> source, List<SessionStep> result, int depth)
    {
        if (depth > 4) return false;
        foreach (var step in source)
        {
            if (step.Kind == StepKind.Repeat)
            {
                if (step.Times is < 1 or > 50 || step.Block is null) return false;
                for (var i = 0; i < step.Times; i++) if (!Expand(step.Block, result, depth + 1)) return false;
            }
            else
            {
                if (step.DistanceKm is { } km ? !double.IsFinite(km) || km <= 0 : step.Duration is not { TotalSeconds: > 0 }) return false;
                result.Add(step);
            }

            if (result.Count > MaximumStages) return false;
        }

        return true;
    }
}

public sealed record StageExecution(int Number, StepKind Kind, double? PlannedMetres, double? PlannedSeconds,
    double RecordedMetres, double MovingSeconds, double ElapsedSeconds, double Coverage,
    double? PaceSecondsPerKm, double? FastestSecondsPerKm, double? SlowestSecondsPerKm, double? InTargetShare);
