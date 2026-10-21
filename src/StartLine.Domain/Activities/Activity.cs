using StartLine.Domain.Common;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Activities;

/// <summary>
/// A run, uploaded or synced, kept as a summary only: totals, splits and best efforts. The original file or streams
/// and any GPS positions are thrown away after reading, so nothing here says where someone runs.
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

    public ActivitySource Source { get; private set; }

    /// <summary>The run's id where it was synced from (a Strava activity id). Null for uploads.</summary>
    public string? ExternalId { get; private set; }

    /// <summary>When a synced copy lapses unless fetched again. Null for uploads, which are kept.</summary>
    public DateTimeOffset? CachedUntil { get; private set; }

    /// <summary>Synced from Strava but recorded on a Garmin device: Strava's policy asks for Garmin to be credited.</summary>
    public bool RecordedOnGarmin { get; private set; }

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
    public static Activity Record(
        Guid runnerId, ActivityRecording recording, DateOnly localDate, IEnumerable<PlannedSessionMatch> plannedThatDay, ActivityOrigin? origin = null)
    {
        ArgumentNullException.ThrowIfNull(recording);
        origin ??= ActivityOrigin.Upload;
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
            Source = origin.Source,
            ExternalId = origin.ExternalId,
            CachedUntil = origin.CachedUntil,
            RecordedOnGarmin = origin.RecordedOnGarmin,
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

    /// <summary>
    /// Takes everything from a fresh copy of the same synced run (fetched again before the cache lapsed): new numbers if
    /// the runner edited it, the plan session as it stands now, and a new <see cref="CachedUntil"/>. The id stays, so
    /// links to the run keep working.
    /// </summary>
    public void RefreshFrom(Activity fresh)
    {
        ArgumentNullException.ThrowIfNull(fresh);
        if (Source == ActivitySource.Upload || fresh.Source != Source || fresh.ExternalId != ExternalId || fresh.RunnerId != RunnerId)
        {
            throw new DomainException("Only a synced run can be refreshed, and only from the same run.");
        }

        StartedAt = fresh.StartedAt;
        LocalDate = fresh.LocalDate;
        Kind = fresh.Kind;
        CachedUntil = fresh.CachedUntil;
        RecordedOnGarmin = fresh.RecordedOnGarmin;
        DistanceMetres = fresh.DistanceMetres;
        MovingTime = fresh.MovingTime;
        ElapsedTime = fresh.ElapsedTime;
        ElevationGainMetres = fresh.ElevationGainMetres;
        AverageHeartRate = fresh.AverageHeartRate;
        MaxHeartRate = fresh.MaxHeartRate;
        Calories = fresh.Calories;
        Halves = fresh.Halves;
        HeartRateDriftPercent = fresh.HeartRateDriftPercent;
        HeartRateTime = fresh.HeartRateTime;
        PlannedSession = fresh.PlannedSession;
        Work = fresh.Work;
        splits.Clear();
        splits.AddRange(fresh.splits);
        bestEfforts.Clear();
        bestEfforts.AddRange(fresh.bestEfforts);
    }

    /// <summary>
    /// Removes every heart-rate reading from the run (averages, per km, time at each heart rate, drift), keeping the
    /// rest. Used when a runner withdraws consent to Taperday keeping heart rate.
    /// </summary>
    public void ForgetHeartRate()
    {
        AverageHeartRate = null;
        MaxHeartRate = null;
        HeartRateDriftPercent = null;
        HeartRateTime = [];
        var withoutHeartRate = splits.Select(s => s with { AverageHeartRate = null }).ToList();
        splits.Clear();
        splits.AddRange(withoutHeartRate);
    }
}
