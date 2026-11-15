using StartLine.Domain.Common;
using StartLine.Domain.Journey;

namespace StartLine.Domain.Tests.Journey;

public sealed class RaceHistoryTests
{
    private static readonly DateOnly Today = new(2026, 11, 15);

    [Fact]
    public void A_past_race_does_not_need_a_training_plan()
    {
        var result = RaceResult.RecordPast(Guid.NewGuid(), Guid.NewGuid(), new(RaceOutcome.Finished, new(2026, 4, 26), TimeSpan.FromHours(4)), Today);
        result.Identify("TCS London Marathon", 42.195, null, RaceTimeKind.OfficialChip);
        result.SavedPlanId.ShouldBeNull();
        result.Major.ShouldBe(MarathonMajor.London);
        result.TimeKind.ShouldBe(RaceTimeKind.OfficialChip);
        result.RaceKey.ShouldBe("2026-04-26|major:London|42.195");
    }

    [Theory]
    [InlineData(MarathonMajor.Sydney, 2024, false)]
    [InlineData(MarathonMajor.Sydney, 2025, true)]
    [InlineData(MarathonMajor.CapeTown, 2025, false)]
    [InlineData(MarathonMajor.CapeTown, 2026, true)]
    [InlineData(MarathonMajor.London, 2000, true)]
    public void The_collection_respects_event_eligibility(MarathonMajor major, int year, bool expected) =>
        MarathonMajors.Qualifies(major, new(year, 5, 1)).ShouldBe(expected);

    [Theory]
    [InlineData("London Half Marathon", 21.1)]
    [InlineData("London Marathon", 21.1)]
    [InlineData("London Marathon Training Run", 42.195)]
    [InlineData("London", 42.195)]
    [InlineData("Tokyo Marathon", 5)]
    public void A_similar_name_or_shorter_event_does_not_identify_a_major(string name, double km) =>
        MarathonMajors.Recognise(name, km).ShouldBeNull();

    [Fact]
    public void Sponsor_aliases_share_an_event_key_but_repeat_editions_do_not()
    {
        var first = RaceResult.RecordPast(Guid.NewGuid(), Guid.NewGuid(), new(RaceOutcome.Finished, new(2025, 4, 27)), Today);
        first.Identify("TCS London Marathon", 42.2, null, RaceTimeKind.Unspecified);
        var same = MarathonMajors.RaceKey("London Marathon", 42.195, first.RaceDate, MarathonMajor.London);
        first.RaceKey.ShouldBe(same);
        MarathonMajors.RaceKey("London Marathon", 42.195, new(2026, 4, 26), MarathonMajor.London).ShouldNotBe(same);
    }

    [Fact]
    public void A_major_cannot_be_assigned_to_a_half_and_a_time_source_needs_a_time()
    {
        var result = RaceResult.RecordPast(Guid.NewGuid(), Guid.NewGuid(), new(RaceOutcome.Finished, Today), Today);
        Should.Throw<DomainException>(() => result.Identify("London half", 21.1, MarathonMajor.London, RaceTimeKind.OfficialChip));
        result.Identify("My first half", 21.1, null, RaceTimeKind.OfficialChip);
        result.TimeKind.ShouldBe(RaceTimeKind.Unspecified);
    }

    [Fact]
    public void A_past_memory_cannot_claim_a_future_finish_or_pre_1900_date()
    {
        Should.Throw<DomainException>(() => RaceResult.RecordPast(Guid.NewGuid(), Guid.NewGuid(), new(RaceOutcome.Finished, Today.AddDays(1)), Today));
        Should.Throw<DomainException>(() => RaceResult.RecordPast(Guid.NewGuid(), Guid.NewGuid(), new(RaceOutcome.Finished, new(1899, 1, 1)), Today));
    }
}
