using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Running;

public sealed class RaceTimePredictorTests
{
    [Fact]
    public void A_50_minute_10K_predicts_roughly_a_3_50_marathon()
    {
        var predicted = RaceTimePredictor.Predict(Distance.TenK, TimeSpan.FromMinutes(50), Distance.Marathon);

        predicted.TotalMinutes.ShouldBe(230, tolerance: 1);
    }

    [Fact]
    public void Predicting_the_same_distance_returns_the_same_time()
    {
        var time = TimeSpan.FromMinutes(24.5);

        RaceTimePredictor.Predict(Distance.FiveK, time, Distance.FiveK).ShouldBe(time);
    }

    [Fact]
    public void Longer_races_are_run_at_a_slower_pace()
    {
        var fiveK = Pace.Of(Distance.FiveK, TimeSpan.FromMinutes(25));
        var marathon = RaceTimePredictor.EquivalentPace(Distance.FiveK, TimeSpan.FromMinutes(25), Distance.Marathon);

        marathon.SecondsPerKilometre.ShouldBeGreaterThan(fiveK.SecondsPerKilometre);
    }
}
