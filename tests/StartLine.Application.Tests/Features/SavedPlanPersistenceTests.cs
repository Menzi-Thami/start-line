using System.Text.Json;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Plans;
using StartLine.Domain.Races;

namespace StartLine.Application.Tests.Features;

public sealed class SavedPlanPersistenceTests
{
    private readonly FakeTimeProvider _time = new(TestRaces.Now);

    private static GeneratePlanQuery Inputs => new("comrades-2027", null, null, null, TimeSpan.FromHours(11),
        [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday], DayOfWeek.Sunday, 40);

    [Fact]
    public void A_catalogue_plan_keeps_the_resolved_race_when_its_listing_disappears()
    {
        var catalogue = TestRaces.Catalogue();
        var builder = new PlanBuilder(catalogue, _time);
        var original = builder.Build(Inputs);
        var inputs = SavedPlanMapping.ToInputs(Inputs, DateOnly.FromDateTime(TestRaces.Now.UtcDateTime), original.Race);
        inputs.HasRaceSnapshot.ShouldBeTrue();
        var saved = SavedPlan.Create(Guid.NewGuid(), "My race", inputs);
        catalogue.FindBySlug("comrades-2027").Returns((Race?)null);

        var restored = builder.Build(SavedPlanMapping.ToQuery(saved));
        restored.Race.ShouldBe(original.Race);
        JsonSerializer.Serialize(restored.Weeks).ShouldBe(JsonSerializer.Serialize(original.Weeks));
    }

    [Fact]
    public void Current_plans_follow_calendar_corrections_and_archived_plans_keep_their_snapshot()
    {
        var catalogue = TestRaces.Catalogue();
        var builder = new PlanBuilder(catalogue, _time);
        var original = builder.Build(Inputs);
        var saved = SavedPlan.Create(Guid.NewGuid(), "My race",
            SavedPlanMapping.ToInputs(Inputs, DateOnly.FromDateTime(TestRaces.Now.UtcDateTime), original.Race));
        var corrected = TestRaces.Comrades with { Date = TestRaces.Comrades.Date.AddDays(7) };
        catalogue.FindBySlug("comrades-2027").Returns(corrected);

        builder.Build(SavedPlanMapping.ToQuery(saved)).Race.Date.ShouldBe(corrected.Date);
        saved.Archive();
        var historical = builder.Build(SavedPlanMapping.ToQuery(saved));
        historical.Race.Date.ShouldBe(original.Race.Date);
        JsonSerializer.Serialize(historical.Weeks).ShouldBe(JsonSerializer.Serialize(original.Weeks));
    }

    [Fact]
    public void Recent_result_distance_time_and_date_round_trip_without_changing_the_goal_outlook()
    {
        var builder = new PlanBuilder(TestRaces.Catalogue(), _time);
        var query = Inputs with
        {
            RaceSlug = null,
            RaceName = "Summer half",
            DistanceKm = 21.0975,
            RaceDate = new DateOnly(2027, 1, 17),
            GoalTime = TimeSpan.FromHours(2),
            RecentResultKm = 10,
            RecentResultTime = TimeSpan.FromMinutes(50),
            RecentResultDate = new DateOnly(2026, 10, 1),
        };
        var original = builder.Build(query);
        var roundTrip = SavedPlanMapping.ToQuery(SavedPlanMapping.ToInputs(query, DateOnly.FromDateTime(TestRaces.Now.UtcDateTime), original.Race));

        roundTrip.RecentResultKm.ShouldBe(10);
        roundTrip.RecentResultTime.ShouldBe(TimeSpan.FromMinutes(50));
        roundTrip.RecentResultDate.ShouldBe(new DateOnly(2026, 10, 1));
        JsonSerializer.Serialize(builder.Build(roundTrip).Outlook).ShouldBe(JsonSerializer.Serialize(original.Outlook));
        roundTrip = roundTrip with { RecentResultKm = null, RecentResultTime = null, RecentResultDate = null };
        JsonSerializer.Serialize(builder.Build(roundTrip).Outlook).ShouldNotBe(JsonSerializer.Serialize(original.Outlook));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(301)]
    public void A_shared_snapshot_still_validates_the_distance(double distance)
    {
        var query = Inputs with { RaceSlug = "removed-race", DistanceKm = distance, RaceDate = new DateOnly(2027, 1, 17) };
        new GeneratePlanValidator(TestRaces.Catalogue(), _time).Validate(query).IsValid.ShouldBeFalse();
    }
}
