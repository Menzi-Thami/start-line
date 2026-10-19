namespace StartLine.Domain.Activities;

public enum PacingVerdict
{
    /// <summary>Second half faster: the classic well-paced race.</summary>
    NegativeSplit,
    Even,

    /// <summary>Second half slower.</summary>
    PositiveSplit,
}

/// <summary>Moving time for the first and second half of the distance, to see whether the runner faded or finished strong.</summary>
public sealed record Halves(double HalfMetres, TimeSpan FirstHalf, TimeSpan SecondHalf)
{
    /// <summary>Within this many seconds per km either way, the halves count as even.</summary>
    public const double EvenSecondsPerKm = 3;

    public double FirstHalfPaceSecondsPerKm => FirstHalf.TotalSeconds / (HalfMetres / 1000);

    public double SecondHalfPaceSecondsPerKm => SecondHalf.TotalSeconds / (HalfMetres / 1000);

    /// <summary>Positive when the second half was slower.</summary>
    public double SecondHalfSlowerBySecondsPerKm => SecondHalfPaceSecondsPerKm - FirstHalfPaceSecondsPerKm;

    public PacingVerdict Verdict => SecondHalfSlowerBySecondsPerKm switch
    {
        > EvenSecondsPerKm => PacingVerdict.PositiveSplit,
        < -EvenSecondsPerKm => PacingVerdict.NegativeSplit,
        _ => PacingVerdict.Even,
    };

    internal static Halves Of(Track track)
    {
        var half = track.TotalMetres / 2;
        var atHalf = track.MovingSecondsAt(half);
        return new Halves(half, TimeSpan.FromSeconds(atHalf), TimeSpan.FromSeconds(track.MovingSeconds - atHalf));
    }
}
