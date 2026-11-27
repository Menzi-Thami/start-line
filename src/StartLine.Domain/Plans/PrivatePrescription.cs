using System.Globalization;
using StartLine.Domain.Common;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public enum GymClass { Upper, Lower }

/// <summary>Private, versioned data. Never part of generator inputs or a public plan link.</summary>
public sealed record PrivatePrescription(int SchemaVersion, IReadOnlyList<PrivateSession> Sessions, IReadOnlyList<PrivatePace> Paces)
{
    public const int CurrentSchemaVersion = 1;
    public const int MaxSessions = 800;

    public void Validate(TrainingPlan baseline, DateOnly today)
    {
        if (SchemaVersion != CurrentSchemaVersion || Sessions is not { Count: > 0 and <= MaxSessions } || Paces is null || Sessions.Any(s => s is null) || Paces.Any(p => p is null))
            Invalid("Use prescription schema version 1 with 1–800 sessions and explicit pace bands.");
        if (baseline.StartDate < today || baseline.RaceDate > today.AddDays(370))
            Invalid("Import a schedule starting today or later, with a race within one year.");
        if (Paces.Count != Enum.GetValues<PaceZone>().Length || Paces.Select(p => p.Zone).Distinct().Count() != Paces.Count)
            Invalid("Supply each pace zone exactly once.");
        foreach (var pace in Paces)
            if (!Enum.IsDefined(pace.Zone) || !ValidPace(pace.FastestSecondsPerKm, pace.SlowestSecondsPerKm))
                Invalid("Pace bands must be finite, ordered and between 90 and 1800 seconds per kilometre.");
        if (Sessions.Select(s => s.Id).Distinct().Count() != Sessions.Count || Sessions.Any(s => s.Id == Guid.Empty)
            || Sessions.GroupBy(s => (s.Date, Gym: s.Type == SessionType.Strength)).Any(g => g.Count() > 1))
            Invalid("Give every session a unique id and schedule at most one run and one gym session per date.");
        foreach (var session in Sessions)
        {
            if (!Enum.IsDefined(session.Type) || session.Date < baseline.StartDate || session.Date > baseline.RaceDate
                || !ValidText(session.Title, 100, required: true) || !ValidText(session.Notes, 1000) || session.TargetRpe is < 1 or > 10)
                Invalid("Check session dates, type, title, notes and target RPE (1–10).");
            if (session.Type == SessionType.Strength)
            {
                if (session.Gym is null || !Enum.IsDefined(session.Gym.Value) || session.DurationMinutes is not (>= 5 and <= 120)
                    || session.Steps is not { Count: 0 } || session.Zone is not null || session.Date == baseline.RaceDate)
                    Invalid("A gym session needs an upper/lower classification and 5–120 minutes, with no running steps or race-day gym.");
                var week = baseline.Weeks.Single(w => w.StartDate <= session.Date && session.Date < w.StartDate.AddDays(7));
                if (session.Gym == GymClass.Lower && (week.IsCutback || week.Phase is TrainingPhase.Taper or TrainingPhase.RaceWeek)
                    && (!session.ReducedLoad || session.TargetRpe > 5))
                    Invalid("Lower-body gym must use reduced load and RPE at most 5 in cutback, taper and race weeks.");
            }
            else
            {
                if (session.Gym is not null || session.DurationMinutes is not null || session.ReducedLoad || session.Zone is null || !Enum.IsDefined(session.Zone.Value)
                    || session.Steps is not { Count: > 0 and <= 32 })
                    Invalid("A running session needs a pace zone and 1–32 measured steps; gym fields do not apply.");
                var total = ValidateSteps(session.Steps, 0);
                if (total is < 0.1 or > 100) Invalid("A complete run, including warm-up, recoveries and cool-down, must be 0.1–100 km.");
                if (session.Type == SessionType.Race && (session.Date != baseline.RaceDate || Math.Abs(total - baseline.RaceDistance.Kilometres) > 0.01))
                    Invalid("The race must match the baseline race date and complete race distance.");
                if (session.Date == baseline.RaceDate && session.Type != SessionType.Race)
                    Invalid("Race day contains only the race.");
            }
        }
        if (Sessions.Count(s => s.Type == SessionType.Race) != 1) Invalid("Include exactly one race at the end of the schedule.");
        var allRuns = Sessions.Where(s => s.Type != SessionType.Strength).OrderBy(s => s.Date).ToList();
        if (allRuns.Zip(allRuns.Skip(1)).Any(pair => pair.Second.Date.DayNumber - pair.First.Date.DayNumber == 1 && IsHard(pair.First) && IsHard(pair.Second)))
            Invalid("Do not schedule consecutive hard running days, including across week boundaries.");
        foreach (var week in baseline.Weeks)
        {
            var sessions = Sessions.Where(s => s.Date >= week.StartDate && s.Date < week.StartDate.AddDays(7)).ToList();
            if (sessions.Count(s => s.Type == SessionType.Strength) > 4 || sessions.Sum(s => s.DistanceKm) > 300)
                Invalid("A private week may contain at most four gym sessions and 300 running kilometres.");
            var runs = sessions.Where(s => s.Type != SessionType.Strength).OrderBy(s => s.Date).ToList();
            if (runs.Zip(runs.Skip(1)).Any(pair => pair.Second.Date.DayNumber - pair.First.Date.DayNumber == 1 && IsHard(pair.First) && IsHard(pair.Second)))
                Invalid("Do not schedule consecutive hard running days.");
            if (week.Phase == TrainingPhase.RaceWeek)
            {
                var previous = Sessions.Where(s => s.Date >= week.StartDate.AddDays(-7) && s.Date < week.StartDate).Sum(s => s.DistanceKm);
                if (previous > 0 && runs.Where(s => s.Type != SessionType.Race).Sum(s => s.DistanceKm) > previous * 0.5)
                    Invalid("Race-week running before the race must be at most half the preceding week's distance.");
            }
        }
    }

    public TrainingPlan Apply(TrainingPlan baseline) => baseline with
    {
        Paces = Paces.ToDictionary(p => p.Zone, p => new PaceRange(Pace.FromSecondsPerKilometre(p.FastestSecondsPerKm), Pace.FromSecondsPerKilometre(p.SlowestSecondsPerKm))),
        Weeks = [.. baseline.Weeks.Select(w => w with
        {
            Sessions = [.. Sessions.Where(s => s.Date >= w.StartDate && s.Date < w.StartDate.AddDays(7)).OrderBy(s => s.Date).ThenBy(s => s.Type).Select(s => s.ToPlanned())]
        })],
        Warnings = [],
        Replan = null,
        SuggestedGoal = null,
    };

    public static bool IsHard(PrivateSession session) => session.Type != SessionType.Strength && (session.TargetRpe >= 7 || LifeHappens.IsHard(session.Type));
    private static bool ValidPace(double fast, double slow) => double.IsFinite(fast) && double.IsFinite(slow) && fast >= 90 && fast <= slow && slow <= 1800;
    private static bool ValidText(string? text, int max, bool required = false) => (!required || !string.IsNullOrWhiteSpace(text))
        && (text is null || text.Length <= max && !text.Any(c => char.IsControl(c) && c is not ('\n' or '\r' or '\t')));
    private static double ValidateSteps(IReadOnlyList<PrivateStep> steps, int depth)
    {
        double total = 0;
        foreach (var step in steps)
        {
            if (step is null || !Enum.IsDefined(step.Kind) || !ValidText(step.Effort, 200)) Invalid("Check step kinds and effort text.");
            if (step.Kind == StepKind.Repeat)
            {
                if (depth >= 2 || step.Times is < 2 or > 30 || step.Steps is not { Count: > 0 and <= 16 }
                    || step.DistanceKm is not null || step.DurationSeconds is not null || step.Zone is not null || step.FastestSecondsPerKm is not null || step.SlowestSecondsPerKm is not null)
                    Invalid("Repeat blocks may be nested twice, contain 1–16 steps, and repeat 2–30 times.");
                total += step.Times * ValidateSteps(step.Steps, depth + 1);
            }
            else
            {
                if (step.Times != 1 || step.Steps is not { Count: 0 } || (step.DistanceKm is null) == (step.DurationSeconds is null)
                    || step.DistanceKm is { } km && (!double.IsFinite(km) || km <= 0 || km > 100)
                    || step.DurationSeconds is { } seconds && (!double.IsFinite(seconds) || seconds <= 0 || seconds > 10800)
                    || step.Zone is null || !Enum.IsDefined(step.Zone.Value) || step.FastestSecondsPerKm is not { } fast
                    || step.SlowestSecondsPerKm is not { } slow || !ValidPace(fast, slow))
                    Invalid("Each step needs a distance OR duration, an explicit ordered pace band and zone, with no child steps.");
                total += step.Kilometres;
            }
        }
        return total;
    }

    [System.Diagnostics.CodeAnalysis.DoesNotReturn]
    private static void Invalid(string message) => throw new DomainException(message);
}

public sealed record PrivatePace(PaceZone Zone, double FastestSecondsPerKm, double SlowestSecondsPerKm);
public sealed record PrivateStep(StepKind Kind, double? DistanceKm, double? DurationSeconds, PaceZone? Zone,
    double? FastestSecondsPerKm, double? SlowestSecondsPerKm, string? Effort, int Times, IReadOnlyList<PrivateStep> Steps)
{
    public double Kilometres => Kind == StepKind.Repeat ? Times * Steps.Sum(s => s.Kilometres)
        : DistanceKm ?? DurationSeconds!.Value / ((FastestSecondsPerKm!.Value + SlowestSecondsPerKm!.Value) / 2);
    /// <summary>Reads like the plan's step list: "Warm up 2 km at 6:15–6:55/km (easy)", "Run 1 min 30 s at …".</summary>
    public string Describe() => Kind == StepKind.Repeat
        ? string.Create(CultureInfo.InvariantCulture, $"Repeat {Times} times: {string.Join(", then ", Steps.Select(s => s.Describe()))}")
        : string.Create(CultureInfo.InvariantCulture, $"{Label(Kind)} {(DistanceKm is { } km ? km.ToString("0.### km", CultureInfo.InvariantCulture) : Duration(DurationSeconds!.Value))} at {Clock(FastestSecondsPerKm!.Value)}–{Clock(SlowestSecondsPerKm!.Value)}/km{(Effort is null ? "" : $" ({Effort})")}");

    private static string Label(StepKind kind) => kind switch
    {
        StepKind.WarmUp => "Warm up",
        StepKind.CoolDown => "Cool down",
        StepKind.Recover => "Recover",
        _ => "Run",
    };

    private static string Clock(double secondsPerKm)
    {
        var total = (int)Math.Round(secondsPerKm);
        return string.Create(CultureInfo.InvariantCulture, $"{total / 60}:{total % 60:00}");
    }

    private static string Duration(double seconds)
    {
        var total = (int)Math.Round(seconds);
        return (total / 60, total % 60) switch
        {
            (0, var s) => string.Create(CultureInfo.InvariantCulture, $"{s} s"),
            (var m, 0) => string.Create(CultureInfo.InvariantCulture, $"{m} min"),
            (var m, var s) => string.Create(CultureInfo.InvariantCulture, $"{m} min {s} s"),
        };
    }
    public SessionStep ToStep() => new(Kind, DistanceKm, DurationSeconds is { } seconds ? TimeSpan.FromSeconds(seconds) : null, Zone,
        FastestSecondsPerKm is { } fast && SlowestSecondsPerKm is { } slow ? new(Pace.FromSecondsPerKilometre(fast), Pace.FromSecondsPerKilometre(slow)) : null,
        Effort, Times, Kind == StepKind.Repeat ? new SessionSteps(Steps.Select(s => s.ToStep())) : null);
}
public sealed record PrivateSession(Guid Id, DateOnly Date, SessionType Type, string Title, int TargetRpe, PaceZone? Zone,
    IReadOnlyList<PrivateStep> Steps, string? Notes = null, GymClass? Gym = null, int? DurationMinutes = null, bool ReducedLoad = false)
{
    public double DistanceKm => Type == SessionType.Strength ? 0 : Math.Round(Steps.Sum(s => s.Kilometres), 3);
    public PlannedSession ToPlanned() => new(Date, Type, Title,
        string.Create(CultureInfo.InvariantCulture, $"{(Gym is { } gym ? $"{gym} body · {DurationMinutes} min{(ReducedLoad ? " · Reduced load" : "")}. " : "")}Target effort {TargetRpe}/10.{(Steps.Count == 0 ? "" : $" {string.Join("; ", Steps.Select(s => s.Describe()))}.")}{(Notes is null ? "" : $" {Notes}")}"),
        "Follow your private prescription; warm-up, recoveries and cool-down are included.", DistanceKm, Zone,
        Type == SessionType.Strength ? null : Steps.Count == 1 && Steps[0].Kind == StepKind.Run ? SessionStructure.Steady : SessionStructure.ByEffort,
        Steps: new SessionSteps(Steps.Select(s => s.ToStep())));
}
