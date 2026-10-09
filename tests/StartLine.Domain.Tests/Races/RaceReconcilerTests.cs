using StartLine.Domain.Races;

namespace StartLine.Domain.Tests.Races;

public sealed class RaceReconcilerTests
{
    private static RaceObservation Seen(
        string source,
        int priority,
        DateOnly date,
        bool byOrganiser = false,
        string slug = "comrades-2027",
        double km = 90,
        bool distanceConfirmed = true,
        string location = "Pietermaritzburg to Durban",
        string name = "Comrades Marathon") =>
        new(source, priority, slug, name, date, km, distanceConfirmed, byOrganiser, location, "", null);

    private static readonly DateOnly June13 = new(2027, 6, 13);
    private static readonly DateOnly June11 = new(2027, 6, 11);

    [Fact]
    public void The_highest_priority_source_wins_a_disagreement()
    {
        var race = RaceReconciler.Reconcile([Seen("calendar", 10, June11), Seen("federation", 50, June13)]).Single();

        race.Date.ShouldBe(June13);
    }

    [Fact]
    public void A_date_from_the_organiser_is_confirmed_even_when_a_lesser_source_disagrees()
    {
        var race = RaceReconciler.Reconcile([Seen("organiser", 100, June13, byOrganiser: true), Seen("calendar", 10, June11)]).Single();

        race.DateStatus.ShouldBe(DateStatus.Confirmed);
    }

    [Fact]
    public void Two_sources_agreeing_confirm_a_date()
    {
        var race = RaceReconciler.Reconcile([Seen("calendar-a", 10, June13), Seen("calendar-b", 20, June13)]).Single();

        race.DateStatus.ShouldBe(DateStatus.Confirmed);
    }

    [Fact]
    public void A_single_secondary_source_is_only_provisional()
    {
        RaceReconciler.Reconcile([Seen("calendar", 10, June13)]).Single().DateStatus.ShouldBe(DateStatus.Provisional);
    }

    [Fact]
    public void Any_disagreement_without_the_organiser_leaves_the_date_provisional()
    {
        var race = RaceReconciler.Reconcile([Seen("a", 30, June13), Seen("b", 20, June13), Seen("c", 10, June11)]).Single();

        race.Date.ShouldBe(June13);
        race.DateStatus.ShouldBe(DateStatus.Provisional);
    }

    [Fact]
    public void Carries_an_unconfirmed_distance_through()
    {
        var race = RaceReconciler.Reconcile([Seen("organiser", 100, June13, byOrganiser: true, distanceConfirmed: false)]).Single();

        race.DistanceConfirmed.ShouldBeFalse();
    }

    [Fact]
    public void Fills_blank_details_from_lower_priority_sources()
    {
        var race = RaceReconciler.Reconcile([Seen("organiser", 100, June13, location: ""), Seen("calendar", 10, June13)]).Single();

        race.Location.ShouldBe("Pietermaritzburg to Durban");
        race.Sources.ShouldBe(["organiser", "calendar"]);
    }

    [Fact]
    public void Matches_slugs_regardless_of_case_and_spacing()
    {
        RaceReconciler.Reconcile([Seen("a", 10, June13, slug: "Comrades-2027 "), Seen("b", 20, June13)]).Count.ShouldBe(1);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(1000)]
    public void Skips_unusable_rows_instead_of_failing_the_whole_calendar(double km)
    {
        var races = RaceReconciler.Reconcile([Seen("bad", 100, June13, km: km), Seen("good", 10, June13, slug: "two-oceans", name: "Two Oceans")]);

        races.Single().Slug.ShouldBe("two-oceans");
    }

    [Fact]
    public void Breaks_priority_ties_the_same_way_every_time()
    {
        var first = RaceReconciler.Reconcile([Seen("zeta", 10, June11), Seen("alpha", 10, June13)]).Single();
        var second = RaceReconciler.Reconcile([Seen("alpha", 10, June13), Seen("zeta", 10, June11)]).Single();

        first.Date.ShouldBe(June13);
        second.Date.ShouldBe(first.Date);
    }

    [Fact]
    public void Lists_races_soonest_first()
    {
        var races = RaceReconciler.Reconcile([Seen("a", 10, June13), Seen("a", 10, new DateOnly(2027, 4, 4), slug: "two-oceans", name: "Two Oceans")]);

        races.Select(r => r.Slug).ShouldBe(["two-oceans", "comrades-2027"]);
    }
}
