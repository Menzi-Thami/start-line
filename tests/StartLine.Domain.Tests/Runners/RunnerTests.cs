using StartLine.Domain.Common;
using StartLine.Domain.Runners;

namespace StartLine.Domain.Tests.Runners;

public sealed class RunnerTests
{
    private static Runner Thandi(int? maxHeartRate = null) => Runner.Register(
        "oid-1", "thandi@example.com", "Thandi", "Africa/Johannesburg", Units.Kilometres, false, "2026-10-09",
        new DateTimeOffset(2026, 10, 9, 8, 0, 0, TimeSpan.Zero), maxHeartRate);

    [Fact]
    public void Max_heart_rate_is_optional() => Thandi().MaxHeartRate.ShouldBeNull();

    [Fact]
    public void A_max_heart_rate_can_be_set_and_cleared()
    {
        var runner = Thandi(186);
        runner.MaxHeartRate.ShouldBe(186);

        runner.UpdateProfile(runner.Email, runner.DisplayName, runner.TimeZone, runner.Units, runner.WeeklyEmails);

        runner.MaxHeartRate.ShouldBeNull();
    }

    [Theory]
    [InlineData(119)]
    [InlineData(231)]
    public void An_implausible_max_heart_rate_is_refused(int bpm) => Should.Throw<DomainException>(() => Thandi(bpm));
}
