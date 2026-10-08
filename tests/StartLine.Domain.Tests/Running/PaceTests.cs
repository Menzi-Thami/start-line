using StartLine.Domain.Common;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Running;

public sealed class PaceTests
{
    [Fact]
    public void Of_divides_time_by_distance()
    {
        var pace = Pace.Of(Distance.TenK, TimeSpan.FromMinutes(50));

        pace.SecondsPerKilometre.ShouldBe(300);
    }

    [Fact]
    public void TimeFor_is_the_inverse_of_Of()
    {
        var pace = Pace.FromSecondsPerKilometre(330);

        pace.TimeFor(Distance.HalfMarathon).TotalSeconds.ShouldBe(330 * 21.0975, tolerance: 0.001);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Rejects_non_positive_or_non_finite_paces(double secondsPerKm) =>
        Should.Throw<DomainException>(() => Pace.FromSecondsPerKilometre(secondsPerKm));

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(400.1)]
    public void Rejects_impossible_distances(double km) =>
        Should.Throw<DomainException>(() => Distance.FromKilometres(km));

    [Fact]
    public void Rejects_a_zero_finish_time() =>
        Should.Throw<DomainException>(() => Pace.Of(Distance.FiveK, TimeSpan.Zero));
}
