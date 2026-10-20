using StartLine.Domain.Common;
using StartLine.Domain.Plans;

namespace StartLine.Domain.Tests.Plans;

public sealed class SavedPlanTests
{
    private static SavedPlanInputs Catalogue(string slug = "comrades-2027", int goalMinutes = 630) => new(
        slug, null, null, null, TimeSpan.FromMinutes(goalMinutes), [DayOfWeek.Tuesday, DayOfWeek.Sunday], DayOfWeek.Sunday, 40,
        Experience.Regular, [], new DateOnly(2026, 10, 8));

    private static SavedPlanInputs Custom(string name, DateOnly date) => new(
        null, name, 21.1, date, TimeSpan.FromMinutes(110), [DayOfWeek.Tuesday, DayOfWeek.Sunday], DayOfWeek.Sunday, 30,
        Experience.Regular, [], new DateOnly(2026, 10, 8));

    [Fact]
    public void A_runner_has_one_current_plan_at_a_time() => SavedPlan.MaxActivePerRunner.ShouldBe(1);

    [Fact]
    public void A_new_plan_is_the_current_one()
    {
        SavedPlan.Create(Guid.NewGuid(), "Comrades", Catalogue()).Status.ShouldBe(SavedPlanStatus.Active);
    }

    [Fact]
    public void The_same_race_is_the_same_catalogue_race_or_the_same_named_race_on_the_same_day()
    {
        var comrades = SavedPlan.Create(Guid.NewGuid(), "Comrades", Catalogue());
        comrades.IsForSameRace(Catalogue(goalMinutes: 600)).ShouldBeTrue();
        comrades.IsForSameRace(Catalogue("two-oceans-2027")).ShouldBeFalse();

        var half = SavedPlan.Create(Guid.NewGuid(), "Club half", Custom("Club half", new DateOnly(2027, 3, 7)));
        half.IsForSameRace(Custom(" club half ", new DateOnly(2027, 3, 7))).ShouldBeTrue();
        half.IsForSameRace(Custom("Club half", new DateOnly(2027, 3, 14))).ShouldBeFalse();
        half.IsForSameRace(Catalogue()).ShouldBeFalse();
    }

    [Fact]
    public void Changing_answers_for_the_same_race_updates_the_current_plan_in_place()
    {
        var plan = SavedPlan.Create(Guid.NewGuid(), "Comrades", Catalogue());
        var id = plan.Id;

        plan.Update(Catalogue(goalMinutes: 600));

        plan.Id.ShouldBe(id);
        plan.Inputs.GoalTime.ShouldBe(TimeSpan.FromMinutes(600));
    }

    [Fact]
    public void A_past_plan_is_read_only_until_it_is_made_current_again()
    {
        var plan = SavedPlan.Create(Guid.NewGuid(), "Comrades", Catalogue());
        plan.Archive();

        plan.Status.ShouldBe(SavedPlanStatus.Archived);
        Should.Throw<DomainException>(() => plan.Update(Catalogue(goalMinutes: 600)));

        plan.Restore();
        plan.Status.ShouldBe(SavedPlanStatus.Active);
        plan.Update(Catalogue(goalMinutes: 600));
    }
}
