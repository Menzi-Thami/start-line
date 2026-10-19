using StartLine.Domain.Common;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Activities;

/// <summary>
/// A run the runner uploaded, kept as a summary only: totals, splits and best efforts. The original file and any
/// GPS positions are thrown away after reading, so nothing here says where someone runs.
/// </summary>
public sealed class Activity
{
    public const int MaxPerRunner = 1000;

    /// <summary>Shorter than this is a watch started by accident, not a run.</summary>
    public const double ShortestRunMetres = 200;

    private readonly List<Split> splits = [];
    private readonly List<BestEffort> bestEfforts = [];

    private Activity()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public DateTimeOffset StartedAt { get; private set; }

    /// <summary>The day it was run in the runner's own time zone: what the plan calls that day.</summary>
    public DateOnly LocalDate { get; private set; }

    public ActivityKind Kind { get; private set; }

    public double DistanceMetres { get; private set; }

    public TimeSpan MovingTime { get; private set; }

    public TimeSpan ElapsedTime { get; private set; }

    public double? ElevationGainMetres { get; private set; }

    public int? AverageHeartRate { get; private set; }

    public int? MaxHeartRate { get; private set; }

    public int? Calories { get; private set; }

    public Halves Halves { get; private set; } = null!;

    public IReadOnlyList<Split> Splits => splits;

    public IReadOnlyList<BestEffort> BestEfforts => bestEfforts;

    /// <summary>The plan's session for that day, or null for an unplanned run.</summary>
    public PlannedSessionMatch? PlannedSession { get; private set; }

    /// <summary>Where the session's real work sat in the run: the fastest stretch of the work block's (or one rep's) length.</summary>
    public WorkWindow? Work { get; private set; }

    /// <summary>Percent the pace per heartbeat dropped from first half to second. Null without heart rate.</summary>
    public double? HeartRateDriftPercent { get; private set; }

    public IReadOnlyList<HeartRateTime> HeartRateTime { get; private set; } = [];

    public DateTimeOffset CreatedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public double DistanceKm => DistanceMetres / 1000;

    public double PaceSecondsPerKm => MovingTime.TotalSeconds / DistanceKm;

    public PlanComparison? ComparedWithPlan => PlannedSession switch
    {
        null => null,
        { Shape: WorkShape.Steady } p => PlanComparison.Of(p, DistanceKm, PaceSecondsPerKm),
        { Shape: WorkShape.Continuous } p => PlanComparison.Of(p, DistanceKm, PaceSecondsPerKm, JudgedPart.WorkBlock, Work?.PaceSecondsPerKm),
        { Shape: WorkShape.Reps } p => PlanComparison.Of(p, DistanceKm, PaceSecondsPerKm, JudgedPart.FastestRep, Work?.PaceSecondsPerKm),
        { } p => PlanComparison.Of(p, DistanceKm, PaceSecondsPerKm, JudgedPart.None, null),
    };

    /// <summary>How the run went against what it was for: split by split, the start, any fade.</summary>
    public RunReview Review() => RunReview.Of(this);

    /// <summary>
    /// Works out everything Taperday shows about a run from the recording, and picks the plan session it was meant
    /// to be from <paramref name="plannedThatDay"/> (sessions from the runner's plans on <paramref name="localDate"/>).
    /// </summary>
    public static Activity Record(Guid runnerId, ActivityRecording recording, DateOnly localDate, IEnumerable<PlannedSessionMatch> plannedThatDay)
    {
        ArgumentNullException.ThrowIfNull(recording);
        ArgumentNullException.ThrowIfNull(plannedThatDay);
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("An activity belongs to a runner.");
        }

        if (recording.Kind == ActivityKind.Other)
        {
            throw new DomainException("Taperday only reads runs, and that file looks like another sport.");
        }

        var track = Track.From(recording.Samples);
        if (track.TotalMetres < ShortestRunMetres || track.MovingSeconds <= 0)
        {
            throw new DomainException("That run is too short to show. Was the watch started by accident?");
        }

        var device = recording.Device;
        var activity = new Activity
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            StartedAt = recording.StartedAt.ToUniversalTime(),
            LocalDate = localDate,
            Kind = recording.Kind,
            DistanceMetres = track.TotalMetres,
            MovingTime = TimeSpan.FromSeconds(track.MovingSeconds),
            ElapsedTime = TimeSpan.FromSeconds(track.ElapsedSeconds),
            ElevationGainMetres = device.AscentMetres ?? track.ElevationGainMetres(),
            AverageHeartRate = device.AverageHeartRate ?? track.AverageHeartRate,
            MaxHeartRate = device.MaxHeartRate ?? track.MaxHeartRate,
            Calories = device.Calories,
            Halves = Halves.Of(track),
            HeartRateDriftPercent = track.HeartRateDriftPercent(),
        };
        activity.HeartRateTime = track.TimeAtHeartRate();
        activity.splits.AddRange(Activities.Splits.ByKilometre(track));
        activity.bestEfforts.AddRange(Activities.BestEfforts.Find(track));
        activity.PlannedSession = PlannedSessionMatch.Pick(plannedThatDay, activity.DistanceKm);
        if (activity.PlannedSession?.WorkMetres is { } workMetres && track.FastestWindow(Math.Min(workMetres, track.TotalMetres)) is { } window)
        {
            activity.Work = new WorkWindow(window.StartMetres, Math.Min(workMetres, track.TotalMetres), TimeSpan.FromSeconds(window.Seconds));
        }

        return activity;
    }
}
