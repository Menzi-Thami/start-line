using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Features.Predictions;
using StartLine.Application.Features.Races;

namespace StartLine.Application.Tests.Features;

public sealed class RacesAndPredictionsTests
{
    [Fact]
    public async Task Lists_only_upcoming_races_soonest_first()
    {
        var handler = new ListUpcomingRacesHandler(TestRaces.Catalogue(), new FakeTimeProvider(TestRaces.Now));

        var races = await handler.Handle(new ListUpcomingRacesQuery(), CancellationToken.None);

        races.Select(r => r.Slug).ShouldBe(["next-weekend-10k", "comrades-2027"]);
    }

    [Fact]
    public async Task A_race_drops_off_the_list_once_its_day_arrives()
    {
        var time = new FakeTimeProvider(TestRaces.Now);
        var handler = new ListUpcomingRacesHandler(TestRaces.Catalogue(), time);

        time.SetUtcNow(new DateTimeOffset(2026, 10, 17, 6, 0, 0, TimeSpan.Zero));
        var races = await handler.Handle(new ListUpcomingRacesQuery(), CancellationToken.None);

        races.ShouldNotContain(r => r.Slug == "next-weekend-10k");
    }

    [Fact]
    public async Task Predicts_a_marathon_from_a_10K()
    {
        var prediction = await new PredictRaceTimeHandler()
            .Handle(new PredictRaceTimeQuery(10, TimeSpan.FromMinutes(50), 42.195), CancellationToken.None);

        prediction.PredictedTime.TotalMinutes.ShouldBe(230, tolerance: 1);
        prediction.PaceSecondsPerKm.ShouldBe(prediction.PredictedTime.TotalSeconds / 42.195, tolerance: 0.01);
    }

    [Fact]
    public void Rejects_an_implausible_result_to_predict_from()
    {
        var result = new PredictRaceTimeValidator().Validate(new PredictRaceTimeQuery(10, TimeSpan.FromMinutes(5), 21.1));

        result.Errors.ShouldHaveSingleItem().PropertyName.ShouldBe("Time");
    }
}
