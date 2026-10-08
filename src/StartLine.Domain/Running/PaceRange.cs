namespace StartLine.Domain.Running;

public sealed record PaceRange(Pace Fastest, Pace Slowest)
{
    public Pace Midpoint => Pace.FromSecondsPerKilometre(
        (Fastest.SecondsPerKilometre + Slowest.SecondsPerKilometre) / 2);
}
