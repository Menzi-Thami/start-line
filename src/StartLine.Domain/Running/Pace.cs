using StartLine.Domain.Common;

namespace StartLine.Domain.Running;

/// <summary>Running pace, stored as seconds per kilometre. A larger value is a slower pace.</summary>
public sealed record Pace
{
    private Pace(double secondsPerKilometre) => SecondsPerKilometre = secondsPerKilometre;

    public double SecondsPerKilometre { get; }

    public static Pace FromSecondsPerKilometre(double secondsPerKilometre)
    {
        if (!double.IsFinite(secondsPerKilometre) || secondsPerKilometre <= 0)
        {
            throw new DomainException("A pace must be a positive number of seconds per kilometre.");
        }

        return new Pace(secondsPerKilometre);
    }

    public static Pace Of(Distance distance, TimeSpan time)
    {
        ArgumentNullException.ThrowIfNull(distance);
        if (time <= TimeSpan.Zero)
        {
            throw new DomainException("A finish time must be positive.");
        }

        return new Pace(time.TotalSeconds / distance.Kilometres);
    }

    public Pace Scale(double factor) => FromSecondsPerKilometre(SecondsPerKilometre * factor);

    public TimeSpan TimeFor(Distance distance)
    {
        ArgumentNullException.ThrowIfNull(distance);
        return TimeSpan.FromSeconds(SecondsPerKilometre * distance.Kilometres);
    }

    public double KilometresIn(TimeSpan duration) => duration.TotalSeconds / SecondsPerKilometre;
}
