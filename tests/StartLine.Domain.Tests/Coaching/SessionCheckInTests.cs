using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Tests.Coaching;

public sealed class SessionCheckInTests
{
    private static readonly Guid Plan = Guid.NewGuid();
    private static readonly DateOnly Tuesday = new(2026, 10, 20);

    private static SessionCheckIn CheckIn(CheckInAnswers answers, SessionType type = SessionType.Tempo) =>
        SessionCheckIn.Create(Plan, Tuesday, type, answers);

    [Fact]
    public void A_run_is_checked_in_with_how_hard_it_felt()
    {
        var checkIn = CheckIn(new CheckInAnswers(CheckInStatus.Done, 7, PainLevel.Niggle, BodyArea.Calf, 9.2, TimeSpan.FromMinutes(48), "  Windy  "));

        checkIn.Effort.ShouldBe(7);
        checkIn.PainArea.ShouldBe(BodyArea.Calf);
        checkIn.Note.ShouldBe("Windy");
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(11)]
    public void A_run_that_happened_needs_an_effort_from_1_to_10(int? effort) =>
        Should.Throw<DomainException>(() => CheckIn(new CheckInAnswers(CheckInStatus.CutShort, effort)));

    [Fact]
    public void A_skipped_run_has_no_effort_distance_or_time()
    {
        CheckIn(new CheckInAnswers(CheckInStatus.Skipped, null)).Effort.ShouldBeNull();
        Should.Throw<DomainException>(() => CheckIn(new CheckInAnswers(CheckInStatus.Skipped, 3)));
        Should.Throw<DomainException>(() => CheckIn(new CheckInAnswers(CheckInStatus.Skipped, null, DistanceKm: 5)));
    }

    [Fact]
    public void Where_it_hurt_needs_something_to_have_hurt() =>
        Should.Throw<DomainException>(() => CheckIn(new CheckInAnswers(CheckInStatus.Done, 4, PainLevel.None, BodyArea.Knee)));

    [Theory]
    [InlineData(0)]
    [InlineData(301)]
    public void A_typed_distance_must_be_a_real_run(double km) =>
        Should.Throw<DomainException>(() => CheckIn(new CheckInAnswers(CheckInStatus.Done, 4, DistanceKm: km)));

    [Fact]
    public void A_long_note_is_refused() =>
        Should.Throw<DomainException>(() => CheckIn(new CheckInAnswers(CheckInStatus.Done, 4, Note: new string('x', 281))));

    [Theory]
    [InlineData(SessionType.Strength)]
    [InlineData(SessionType.Race)]
    public void Only_runs_are_checked_in_on(SessionType type) =>
        Should.Throw<DomainException>(() => CheckIn(new CheckInAnswers(CheckInStatus.Done, 5), type));

    [Fact]
    public void New_answers_replace_the_old_ones()
    {
        var checkIn = CheckIn(new CheckInAnswers(CheckInStatus.Done, 6, PainLevel.Niggle, BodyArea.Knee));

        checkIn.Answer(new CheckInAnswers(CheckInStatus.CutShort, 9));

        checkIn.Status.ShouldBe(CheckInStatus.CutShort);
        checkIn.Effort.ShouldBe(9);
        checkIn.Pain.ShouldBe(PainLevel.None);
        checkIn.PainArea.ShouldBeNull();
    }
}
