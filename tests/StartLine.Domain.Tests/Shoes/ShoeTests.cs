using StartLine.Domain.Common;
using StartLine.Domain.Shoes;

namespace StartLine.Domain.Tests.Shoes;

public class ShoeTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 6, 0, 0, TimeSpan.Zero);

    private static Shoe Pair(double startingKm = 0, double limitKm = 700, bool remind = true) =>
        Shoe.Create(Guid.NewGuid(), "  Pegasus 41  ", startingKm, limitKm, remind);

    [Fact]
    public void A_pair_is_named_and_measured_within_sensible_bounds()
    {
        var shoe = Pair(120.04, 650.4);
        shoe.Name.ShouldBe("Pegasus 41");
        shoe.StartingKm.ShouldBe(120);
        shoe.LimitKm.ShouldBe(650);
        Should.Throw<DomainException>(() => Pair(limitKm: 50));
        Should.Throw<DomainException>(() => Pair(startingKm: -1));
        Should.Throw<DomainException>(() => Shoe.Create(Guid.NewGuid(), " ", 0, 700, true));
    }

    [Theory]
    [InlineData(600, ShoeWear.Fine)]
    [InlineData(630, ShoeWear.NearingLimit)]
    [InlineData(700, ShoeWear.PastLimit)]
    public void Wear_is_judged_against_the_limit(double km, ShoeWear wear) => Pair().WearAt(km).ShouldBe(wear);

    [Fact]
    public void A_pair_reminds_once_per_limit_and_again_when_the_limit_changes()
    {
        var shoe = Pair();
        shoe.ShouldRemind(699).ShouldBeFalse();
        shoe.ShouldRemind(700).ShouldBeTrue();
        shoe.MarkReminded();
        shoe.ShouldRemind(750).ShouldBeFalse();

        shoe.Edit(shoe.Name, shoe.StartingKm, 800, remindAtLimit: true);
        shoe.ShouldRemind(805).ShouldBeTrue();
    }

    [Fact]
    public void A_retired_pair_never_reminds_and_cannot_be_the_default()
    {
        var shoe = Pair();
        shoe.MakeDefault();
        shoe.Retire(Now);
        shoe.IsDefault.ShouldBeFalse();
        shoe.ShouldRemind(900).ShouldBeFalse();
        Should.Throw<DomainException>(shoe.MakeDefault);
        shoe.Return();
        shoe.MakeDefault();
        shoe.IsDefault.ShouldBeTrue();
    }

    [Fact]
    public void An_assignment_is_for_exactly_one_run()
    {
        Should.Throw<DomainException>(() => ShoeAssignment.ForActivity(Guid.Empty, Guid.NewGuid(), Guid.NewGuid()));
        Should.Throw<DomainException>(() => ShoeAssignment.ForActivity(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()).MoveToShoe(Guid.Empty));
        var worn = ShoeAssignment.ForCheckIn(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        worn.ActivityId.ShouldBeNull();
        worn.CheckInId.ShouldNotBeNull();
    }
}
