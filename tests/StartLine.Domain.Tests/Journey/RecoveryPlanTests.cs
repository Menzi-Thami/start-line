using StartLine.Domain.Common;
using StartLine.Domain.Journey;

namespace StartLine.Domain.Tests.Journey;

public class RecoveryPlanTests
{
    private static readonly DateOnly Race = new(2026, 11, 1);

    private static RecoveryPlan Start(DateOnly? today = null, Guid? plan = null, DateOnly? race = null) =>
        RecoveryPlan.Start(Guid.NewGuid(), plan, "  City Half  ", 21.1, race ?? Race, RecoveryEffort.Hard, RecoveryPreference.Walk, null, today ?? Race.AddDays(1));

    [Fact]
    public void A_recovery_starts_active_at_version_one_after_the_race()
    {
        var recovery = Start();

        recovery.Status.ShouldBe(RecoveryStatus.Active);
        recovery.GeneratorVersion.ShouldBe(RecoveryGenerator.Version);
        recovery.EventName.ShouldBe("City Half");
        Should.Throw<DomainException>(() => Start(today: Race.AddDays(-1)));
        Should.Throw<DomainException>(() => RecoveryPlan.Start(Guid.NewGuid(), null, null, 0, Race, RecoveryEffort.Hard, RecoveryPreference.Rest, null, Race));
    }

    [Fact]
    public void An_event_outside_a_plan_must_be_in_the_last_60_days()
    {
        Should.NotThrow(() => Start(today: Race.AddDays(60)));
        Should.Throw<DomainException>(() => Start(today: Race.AddDays(61)));
        Should.NotThrow(() => Start(today: Race.AddDays(61), plan: Guid.NewGuid()));
    }

    [Fact]
    public void A_check_in_is_one_per_day_from_race_day_to_today()
    {
        var recovery = Start(today: Race.AddDays(2));

        recovery.CheckIn(Race.AddDays(2), RecoveryFeeling.StillSore, null, "legs heavy", Race.AddDays(2));
        recovery.CheckIn(Race.AddDays(2), RecoveryFeeling.GoodToGo, [RecoveryRedFlag.MarkedSwelling, RecoveryRedFlag.MarkedSwelling], null, Race.AddDays(2));

        var only = recovery.CheckIns.ShouldHaveSingleItem();
        only.Feeling.ShouldBe(RecoveryFeeling.GoodToGo);
        only.RedFlags.ShouldBe([RecoveryRedFlag.MarkedSwelling]);
        Should.Throw<DomainException>(() => recovery.CheckIn(Race.AddDays(3), RecoveryFeeling.GoodToGo, null, null, Race.AddDays(2)));
        Should.Throw<DomainException>(() => recovery.CheckIn(Race.AddDays(-1), RecoveryFeeling.GoodToGo, null, null, Race.AddDays(2)));
        Should.Throw<DomainException>(() => recovery.CheckIn(Race, RecoveryFeeling.GoodToGo, null, new string('x', 281), Race.AddDays(2)));
    }

    [Fact]
    public void Pausing_and_resuming_records_the_paused_days_and_repeats_change_nothing()
    {
        var recovery = Start();
        var before = recovery.Schedule(Race.AddDays(6)).EndsOn;

        recovery.Pause(Race.AddDays(2));
        recovery.Pause(Race.AddDays(3));
        recovery.Status.ShouldBe(RecoveryStatus.Paused);
        recovery.Resume(Race.AddDays(5));
        recovery.Resume(Race.AddDays(6));

        recovery.Status.ShouldBe(RecoveryStatus.Active);
        recovery.Pauses.ShouldHaveSingleItem().ShouldBe(new RecoveryPause(Race.AddDays(2), Race.AddDays(5)));
        recovery.Schedule(Race.AddDays(6)).EndsOn.ShouldBe(before.AddDays(3));
    }

    [Fact]
    public void A_pause_resumed_the_same_day_leaves_no_trace()
    {
        var recovery = Start();
        recovery.Pause(Race.AddDays(3));
        recovery.Resume(Race.AddDays(3));

        recovery.Pauses.ShouldBeEmpty();
    }

    [Fact]
    public void Finishing_needs_good_to_go_and_ending_early_is_always_allowed()
    {
        var recovery = Start(today: Race.AddDays(3));
        recovery.CheckIn(Race.AddDays(3), RecoveryFeeling.StillSore, null, null, Race.AddDays(3));
        Should.Throw<DomainException>(() => recovery.Complete(Race.AddDays(3)));

        recovery.CheckIn(Race.AddDays(3), RecoveryFeeling.GoodToGo, null, null, Race.AddDays(3));
        recovery.Complete(Race.AddDays(3));
        recovery.Status.ShouldBe(RecoveryStatus.Completed);
        recovery.EndedOn.ShouldBe(Race.AddDays(3));

        var other = Start();
        other.End(Race.AddDays(2));
        other.Status.ShouldBe(RecoveryStatus.Ended);
        Should.Throw<DomainException>(() => other.Pause(Race.AddDays(3)));
    }

    [Fact]
    public void Restarting_begins_again_from_today_keeping_the_check_ins()
    {
        var recovery = Start(today: Race.AddDays(2));
        recovery.CheckIn(Race.AddDays(2), RecoveryFeeling.GoodToGo, null, null, Race.AddDays(2));
        recovery.Extend(5);
        recovery.End(Race.AddDays(4));

        recovery.Restart(Race.AddDays(10));

        recovery.Status.ShouldBe(RecoveryStatus.Active);
        recovery.EndedOn.ShouldBeNull();
        recovery.ExtraDays.ShouldBe(0);
        recovery.CheckIns.Count.ShouldBe(1);
        var schedule = recovery.Schedule(Race.AddDays(10));
        schedule.Days.Single(d => d.Date == Race.AddDays(10)).Phase.ShouldBe(RecoveryPhase.Rest);
        schedule.EndsOn.ShouldBe(Race.AddDays(9 + schedule.RestDays + schedule.GentleDays + schedule.EasyReturnDays));
    }

    [Fact]
    public void Extending_is_1_to_14_days_at_a_time_and_bounded_overall()
    {
        var recovery = Start();
        Should.Throw<DomainException>(() => recovery.Extend(0));
        Should.Throw<DomainException>(() => recovery.Extend(15));
        recovery.Extend(14);
        recovery.Extend(14);
        recovery.Extend(14);
        Should.Throw<DomainException>(() => recovery.Extend(1));
        recovery.ExtraDays.ShouldBe(RecoveryPlan.MaxExtraDays);
    }
}
