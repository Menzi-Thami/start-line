using StartLine.Domain.Common;

namespace StartLine.Domain.Activities;

/// <summary>
/// A cleaned-up recording that can answer "how long to get from here to there". Samples are put in time order
/// and distance never goes backwards (GPS can wobble back a metre). Between two samples the runner is assumed
/// to move at a steady speed, so any distance can be placed in time by interpolation.
/// </summary>
internal sealed class Track
{
    /// <summary>Slower than a slow walk (1.8 km/h) counts as standing still: lights, a shoelace, a paused watch.</summary>
    public const double MinMovingMetresPerSecond = 0.5;

    /// <summary>Climbs smaller than this are GPS or barometer noise, not hills.</summary>
    public const double ClimbNoiseMetres = 3;

    private readonly double[] distance;
    private readonly double[] elapsed;
    private readonly double[] moving;
    private readonly double?[] altitude;
    private readonly int?[] heartRate;

    private Track(double[] distance, double[] elapsed, double[] moving, double?[] altitude, int?[] heartRate)
    {
        this.distance = distance;
        this.elapsed = elapsed;
        this.moving = moving;
        this.altitude = altitude;
        this.heartRate = heartRate;
    }

    public double TotalMetres => distance[^1];

    public double ElapsedSeconds => elapsed[^1];

    public double MovingSeconds => moving[^1];

    public int? MaxHeartRate => heartRate.Max();

    public int? AverageHeartRate => AverageHeartRateBetween(double.MinValue, double.MaxValue);

    public static Track From(IReadOnlyList<ActivitySample> samples)
    {
        ArgumentNullException.ThrowIfNull(samples);
        var ordered = samples
            .Where(s => double.IsFinite(s.DistanceMetres) && s.DistanceMetres >= 0 && s.Elapsed >= TimeSpan.Zero)
            .OrderBy(s => s.Elapsed)
            .ToList();
        if (ordered.Count < 2)
        {
            throw new DomainException("That run has no distance recorded, so there's nothing to show.");
        }

        var count = ordered.Count;
        var distance = new double[count];
        var elapsed = new double[count];
        var moving = new double[count];
        var altitude = new double?[count];
        var heartRate = new int?[count];
        for (var i = 0; i < count; i++)
        {
            elapsed[i] = ordered[i].Elapsed.TotalSeconds;
            distance[i] = i == 0 ? ordered[i].DistanceMetres : Math.Max(distance[i - 1], ordered[i].DistanceMetres);
            altitude[i] = ordered[i].AltitudeMetres is { } metres && double.IsFinite(metres) ? metres : null;
            heartRate[i] = ordered[i].HeartRate is > 0 and < 250 ? ordered[i].HeartRate : null;
            if (i > 0)
            {
                var seconds = elapsed[i] - elapsed[i - 1];
                var isMoving = seconds > 0 && (distance[i] - distance[i - 1]) / seconds >= MinMovingMetresPerSecond;
                moving[i] = moving[i - 1] + (isMoving ? seconds : 0);
            }
        }

        // Distance and time are measured from the first sample, so a watch that starts its counters late still reads from zero.
        var startMetres = distance[0];
        var startSeconds = elapsed[0];
        for (var i = 0; i < count; i++)
        {
            distance[i] -= startMetres;
            elapsed[i] -= startSeconds;
        }

        return new Track(distance, elapsed, moving, altitude, heartRate);
    }

    /// <summary>Moving time from the start until the runner first reached this distance.</summary>
    public double MovingSecondsAt(double metres) => Interpolate(moving, FirstIndexReaching(metres), metres);

    /// <summary>The first moment the runner reached this distance.</summary>
    public double FirstElapsedAt(double metres) => Interpolate(elapsed, FirstIndexReaching(metres), metres);

    /// <summary>The last moment the runner was still at this distance (after any stop there).</summary>
    public double LastElapsedAt(double metres)
    {
        var i = LastIndexAtOrBefore(metres);
        if (i >= distance.Length - 1)
        {
            return elapsed[^1];
        }

        var span = distance[i + 1] - distance[i];
        var fraction = span <= 0 ? 0 : Math.Clamp((metres - distance[i]) / span, 0, 1);
        return elapsed[i] + (fraction * (elapsed[i + 1] - elapsed[i]));
    }

    /// <summary>Altitude where the runner first reached this distance, or null if the watch recorded none there.</summary>
    public double? AltitudeAt(double metres) => altitude[FirstIndexReaching(metres)];

    /// <summary>Average heart rate over the samples in this stretch, or null without a heart-rate reading.</summary>
    public int? AverageHeartRateBetween(double fromMetres, double toMetres)
    {
        var readings = Enumerable.Range(0, distance.Length)
            .Where(i => distance[i] > fromMetres && distance[i] <= toMetres && heartRate[i] is not null)
            .Select(i => heartRate[i]!.Value)
            .ToList();
        return readings.Count == 0 ? null : (int)Math.Round(readings.Average());
    }

    /// <summary>
    /// Total climb, counting only rises of at least <see cref="ClimbNoiseMetres"/> from the last low point,
    /// so a flat run with jittery altitude doesn't report hills.
    /// </summary>
    public double? ElevationGainMetres()
    {
        var readings = altitude.Where(a => a is not null).Select(a => a!.Value).ToList();
        if (readings.Count < 2)
        {
            return null;
        }

        var gain = 0d;
        var low = readings[0];
        foreach (var reading in readings)
        {
            if (reading - low >= ClimbNoiseMetres)
            {
                gain += reading - low;
                low = reading;
            }
            else if (reading < low)
            {
                low = reading;
            }
        }

        return gain;
    }

    /// <summary>The fastest wall-clock time to cover <paramref name="metres"/> anywhere in the run, or null if the run is shorter.</summary>
    public double? FastestElapsedOver(double metres) => FastestWindow(metres)?.Seconds;

    /// <summary>Where the fastest stretch of <paramref name="metres"/> starts, and how long it took. Null if the run is shorter.</summary>
    public (double StartMetres, double Seconds)? FastestWindow(double metres)
    {
        if (metres <= 0 || TotalMetres < metres)
        {
            return null;
        }

        // Time over a window is piecewise linear in where the window sits, so the best window starts or ends on a sample.
        var best = (StartMetres: 0d, Seconds: double.MaxValue);
        for (var i = 0; i < distance.Length; i++)
        {
            if (distance[i] >= metres)
            {
                var seconds = elapsed[i] - LastElapsedAt(distance[i] - metres);
                if (seconds < best.Seconds)
                {
                    best = (distance[i] - metres, seconds);
                }
            }

            if (distance[i] + metres <= TotalMetres)
            {
                var seconds = FirstElapsedAt(distance[i] + metres) - elapsed[i];
                if (seconds < best.Seconds)
                {
                    best = (distance[i], seconds);
                }
            }
        }

        return best;
    }

    /// <summary>Moving seconds spent at each heart rate (whole bpm). Empty without heart-rate readings.</summary>
    public IReadOnlyList<HeartRateTime> TimeAtHeartRate()
    {
        var seconds = new SortedDictionary<int, double>();
        for (var i = 1; i < distance.Length; i++)
        {
            var step = moving[i] - moving[i - 1];
            if (step > 0 && heartRate[i] is { } bpm)
            {
                seconds[bpm] = seconds.GetValueOrDefault(bpm) + step;
            }
        }

        return [.. seconds.Select(s => new HeartRateTime(s.Key, Math.Round(s.Value, 1)))];
    }

    /// <summary>
    /// How much heart rate rose against pace from the first half to the second, in percent (pace per beat, the
    /// usual "decoupling"). Null without heart rate in both halves. Only meaningful for a steady run.
    /// </summary>
    public double? HeartRateDriftPercent()
    {
        var half = TotalMetres / 2;
        var firstSeconds = MovingSecondsAt(half);
        var secondSeconds = MovingSeconds - firstSeconds;
        if (AverageHeartRateBetween(double.MinValue, half) is not { } firstHr
            || AverageHeartRateBetween(half, double.MaxValue) is not { } secondHr
            || firstSeconds <= 0 || secondSeconds <= 0)
        {
            return null;
        }

        var firstEfficiency = half / firstSeconds / firstHr;
        var secondEfficiency = half / secondSeconds / secondHr;
        return Math.Round((1 - (secondEfficiency / firstEfficiency)) * 100, 1);
    }

    private double Interpolate(double[] values, int index, double metres)
    {
        if (index == 0)
        {
            return values[0];
        }

        var span = distance[index] - distance[index - 1];
        var fraction = span <= 0 ? 1 : Math.Clamp((metres - distance[index - 1]) / span, 0, 1);
        return values[index - 1] + (fraction * (values[index] - values[index - 1]));
    }

    private int FirstIndexReaching(double metres)
    {
        var index = Array.BinarySearch(distance, metres);
        if (index < 0)
        {
            return Math.Min(~index, distance.Length - 1);
        }

        // Several samples can share a distance (standing still); the first one is when it was reached.
        while (index > 0 && distance[index - 1] >= metres)
        {
            index--;
        }

        return index;
    }

    private int LastIndexAtOrBefore(double metres)
    {
        var index = Array.BinarySearch(distance, metres);
        if (index < 0)
        {
            return Math.Max(~index - 1, 0);
        }

        while (index < distance.Length - 1 && distance[index + 1] <= metres)
        {
            index++;
        }

        return index;
    }
}
