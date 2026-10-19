using System.Globalization;

namespace StartLine.Domain.Plans;

/// <summary>Runner-focused strength moves: legs, hips and trunk, each needing no more than a step and a weight.</summary>
public enum Exercise
{
    Squat,
    RomanianDeadlift,
    ReverseLunge,
    BulgarianSplitSquat,
    StepUp,
    GluteBridge,
    CalfRaise,
    Plank,
    SidePlank,
    SquatJump,
}

/// <summary>What one set asks for: a number of reps, or a hold in seconds, for both legs together or each side.</summary>
public enum RepUnit
{
    Reps,
    RepsEachLeg,
    Seconds,
    SecondsEachSide,
}

public sealed record StrengthExercise(Exercise Exercise, int Sets, int Reps, RepUnit Unit);

/// <summary>
/// The strength routine for a week. It follows the running: learn the moves with body weight in Base, add load and
/// single-leg work in Build, fewer and heavier reps plus a little spring in Peak, and keep it light in easier weeks
/// and the taper so strength never steals from the running.
/// </summary>
internal static class StrengthRoutine
{
    public static IReadOnlyList<StrengthExercise> For(TrainingPhase phase, bool isCutback) => (phase, isCutback) switch
    {
        (TrainingPhase.Taper, _) or (_, true) =>
        [
            new(Exercise.Squat, 2, 10, RepUnit.Reps),
            new(Exercise.GluteBridge, 2, 12, RepUnit.Reps),
            new(Exercise.CalfRaise, 2, 15, RepUnit.Reps),
            new(Exercise.Plank, 2, 30, RepUnit.Seconds),
        ],
        (TrainingPhase.Base, _) =>
        [
            new(Exercise.Squat, 3, 10, RepUnit.Reps),
            new(Exercise.RomanianDeadlift, 3, 10, RepUnit.Reps),
            new(Exercise.ReverseLunge, 3, 8, RepUnit.RepsEachLeg),
            new(Exercise.GluteBridge, 3, 12, RepUnit.Reps),
            new(Exercise.CalfRaise, 3, 15, RepUnit.Reps),
            new(Exercise.Plank, 3, 30, RepUnit.Seconds),
        ],
        (TrainingPhase.Build, _) =>
        [
            new(Exercise.RomanianDeadlift, 3, 8, RepUnit.Reps),
            new(Exercise.BulgarianSplitSquat, 3, 8, RepUnit.RepsEachLeg),
            new(Exercise.StepUp, 3, 8, RepUnit.RepsEachLeg),
            new(Exercise.CalfRaise, 3, 12, RepUnit.RepsEachLeg),
            new(Exercise.SidePlank, 3, 30, RepUnit.SecondsEachSide),
        ],
        _ =>
        [
            new(Exercise.RomanianDeadlift, 3, 6, RepUnit.Reps),
            new(Exercise.BulgarianSplitSquat, 3, 6, RepUnit.RepsEachLeg),
            new(Exercise.SquatJump, 3, 6, RepUnit.Reps),
            new(Exercise.CalfRaise, 3, 12, RepUnit.RepsEachLeg),
            new(Exercise.SidePlank, 2, 30, RepUnit.SecondsEachSide),
        ],
    };

    /// <summary>The routine as one line for calendars: "3 × 10 squats, 3 × 8 reverse lunges each leg, ...".</summary>
    public static string Describe(IEnumerable<StrengthExercise> exercises) =>
        string.Join(", ", exercises.Select(e => string.Create(CultureInfo.InvariantCulture, $"{e.Sets} × {Dose(e)}")));

    private static string Dose(StrengthExercise e) => e.Unit switch
    {
        RepUnit.Reps => $"{e.Reps} {Name(e.Exercise)}",
        RepUnit.RepsEachLeg => $"{e.Reps} {Name(e.Exercise)} each leg",
        RepUnit.Seconds => $"{e.Reps} s {Name(e.Exercise)}",
        _ => $"{e.Reps} s {Name(e.Exercise)} each side",
    };

    private static string Name(Exercise exercise) => exercise switch
    {
        Exercise.Squat => "squats",
        Exercise.RomanianDeadlift => "Romanian deadlifts",
        Exercise.ReverseLunge => "reverse lunges",
        Exercise.BulgarianSplitSquat => "Bulgarian split squats",
        Exercise.StepUp => "step-ups",
        Exercise.GluteBridge => "glute bridges",
        Exercise.CalfRaise => "calf raises",
        Exercise.Plank => "plank",
        Exercise.SidePlank => "side plank",
        Exercise.SquatJump => "squat jumps",
        _ => throw new ArgumentOutOfRangeException(nameof(exercise), exercise, "Not an exercise."),
    };
}
