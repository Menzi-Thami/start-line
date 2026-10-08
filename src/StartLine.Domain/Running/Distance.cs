using StartLine.Domain.Common;

namespace StartLine.Domain.Running;

public sealed record Distance
{
    public const double MaxKilometres = 400;

    public static readonly Distance FiveK = new(5);
    public static readonly Distance TenK = new(10);
    public static readonly Distance HalfMarathon = new(21.0975);
    public static readonly Distance Marathon = new(42.195);

    private Distance(double kilometres) => Kilometres = kilometres;

    public double Kilometres { get; }

    public static Distance FromKilometres(double kilometres)
    {
        if (!double.IsFinite(kilometres) || kilometres <= 0 || kilometres > MaxKilometres)
        {
            throw new DomainException($"A distance must be greater than 0 and at most {MaxKilometres} km.");
        }

        return new Distance(kilometres);
    }
}
