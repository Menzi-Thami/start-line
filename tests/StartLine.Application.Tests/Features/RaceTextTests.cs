using StartLine.Application.Features.Races;
using StartLine.Domain.Races;

namespace StartLine.Application.Tests.Features;

public sealed class RaceTextTests
{
    [Theory]
    [InlineData("Om Dié Dam", "om die dam")]
    [InlineData("Two-Oceans  Ultra!", "two oceans ultra")]
    [InlineData("KNYSNA", "knysna")]
    public void Normalising_drops_case_accents_and_punctuation(string text, string expected) =>
        string.Join(' ', RaceText.Words(text)).ShouldBe(expected);

    [Fact]
    public void A_race_is_a_headline_race_when_any_source_says_so()
    {
        var day = new DateOnly(2027, 5, 23);
        var races = RaceReconciler.Reconcile([
            new RaceObservation("Curated list", 10, "ctm", "Cape Town Marathon", day, 42.195, true, true, "Cape Town", "", null, Major: true),
            new RaceObservation("Race database", 5, "ctm", "Cape Town Marathon", day, 42.195, true, false, "Cape Town", "", null),
            new RaceObservation("Race database", 5, "knysna", "Knysna Forest Marathon", day, 42.195, true, false, "Knysna", "", null),
        ]);
        races.Single(r => r.Slug == "ctm").Major.ShouldBeTrue();
        races.Single(r => r.Slug == "knysna").Major.ShouldBeFalse();
    }
}
