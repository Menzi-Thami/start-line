using StartLine.Domain.Common;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Notifications;

/// <summary>Which reminder a device is due, and when: from the plan as written and the runner's own clock.</summary>
public sealed class ReminderTests
{
    private static readonly TimeOnly Seven = new(7, 0);

    // A three-week 5K plan. Week 1 starts Monday 2 November; race week starts Monday 16 November; the race is Sunday 22nd.
    private static readonly TrainingPlan Plan = new(
        Distance.FiveK,
        DistanceCategory.FiveK,
        new DateOnly(2026, 11, 22),
        TimeSpan.FromMinutes(25),
        new DateOnly(2026, 11, 2),
        new Dictionary<PaceZone, PaceRange>(),
        [
            Week(1, new DateOnly(2026, 11, 2), TrainingPhase.Base,
                Run(new DateOnly(2026, 11, 3), SessionType.Easy, "Easy run"),
                Run(new DateOnly(2026, 11, 4), SessionType.Strength, "Strength"),
                Run(new DateOnly(2026, 11, 5), SessionType.Tempo, "Tempo run"),
                Run(new DateOnly(2026, 11, 5), SessionType.Strength, "Strength"),
                Run(new DateOnly(2026, 11, 7), SessionType.LongRun, "Long run")),
            Week(2, new DateOnly(2026, 11, 9), TrainingPhase.Build,
                Run(new DateOnly(2026, 11, 9), SessionType.EasyWithStrides, "Easy run + strides"),
                Run(new DateOnly(2026, 11, 11), SessionType.Intervals, "Intervals"),
                Run(new DateOnly(2026, 11, 14), SessionType.LongRun, "Long run")),
            Week(3, new DateOnly(2026, 11, 16), TrainingPhase.RaceWeek,
                Run(new DateOnly(2026, 11, 17), SessionType.Easy, "Easy run"),
                Run(new DateOnly(2026, 11, 21), SessionType.Shakeout, "Shakeout"),
                Run(new DateOnly(2026, 11, 22), SessionType.Race, "Race")),
        ],
        []);

    private static PlanWeek Week(int number, DateOnly start, TrainingPhase phase, params PlannedSession[] sessions) =>
        new(number, start, phase, false, sessions);

    private static PlannedSession Run(DateOnly date, SessionType type, string title) =>
        new(date, type, title, "", "", type == SessionType.Strength ? 0 : 6, null);

    private static DateTime At(int month, int day, int hour, int minute = 0) => new(2026, month, day, hour, minute, 0);

    /// <summary>A device set up the evening before the plan starts, so nothing is marked yet.</summary>
    private static PushSubscription Device(TimeOnly? remindAt = null, bool weekAhead = false, DateTime? setUpAt = null) =>
        PushSubscription.Start(Guid.NewGuid(), new string('a', PushSubscription.DeviceKeyLength), new ProtectedPushAddress("e", "k", "a"),
            remindAt ?? Seven, weekAhead, setUpAt ?? At(11, 1, 20));

    [Fact]
    public void A_run_day_reminds_at_the_chosen_time_and_not_before()
    {
        var device = Device();

        Reminders.Due(device, Plan, At(11, 3, 6, 59)).ShouldBeNull();
        Reminders.Due(device, Plan, At(11, 3, 7)).ShouldBe(
            new Reminder(new DateOnly(2026, 11, 3), Reminders.RunTitle, "Easy run. Open Taperday for the distance and paces."));
    }

    [Fact]
    public void A_rest_day_has_no_reminder_and_strength_alone_is_not_a_run()
    {
        var device = Device();

        Reminders.Due(device, Plan, At(11, 2, 9)).ShouldBeNull();
        Reminders.Due(device, Plan, At(11, 4, 9)).ShouldBeNull();
    }

    [Fact]
    public void A_run_with_strength_the_same_day_names_only_the_run()
    {
        Reminders.Due(Device(), Plan, At(11, 5, 7))!.Body.ShouldBe("Tempo run. Open Taperday for the distance and paces.");
    }

    [Fact]
    public void Race_day_says_so()
    {
        var reminder = Reminders.Due(Device(), Plan, At(11, 22, 7))!;

        reminder.Title.ShouldBe(Reminders.RaceTitle);
        reminder.Body.ShouldBe(Reminders.RaceBody);
    }

    [Fact]
    public void A_late_check_still_sends_the_days_reminder_that_day()
    {
        // The app slept through 07:00; the first check is that evening.
        Reminders.Due(Device(), Plan, At(11, 3, 22, 30))!.Date.ShouldBe(new DateOnly(2026, 11, 3));
    }

    [Fact]
    public void A_day_missed_altogether_is_not_sent_the_next_day()
    {
        // Asleep all Thursday (the tempo); Friday is a rest day, so Friday has nothing, and Thursday's is gone.
        Reminders.Due(Device(), Plan, At(11, 6, 9)).ShouldBeNull();
    }

    [Fact]
    public void A_reminder_already_sent_today_is_never_sent_again()
    {
        var device = Device();
        var reminder = Reminders.Due(device, Plan, At(11, 3, 7))!;

        device.MarkReminded(reminder.Date);

        Reminders.Due(device, Plan, At(11, 3, 7, 5)).ShouldBeNull();
        Reminders.Due(device, Plan, At(11, 3, 23, 59)).ShouldBeNull();
        Should.Throw<DomainException>(() => device.MarkReminded(reminder.Date));
    }

    [Fact]
    public void Turned_on_after_todays_time_the_first_reminder_is_tomorrows()
    {
        // 09:00 on a run day, reminders at 07:00: nothing straight away.
        var device = Device(setUpAt: At(11, 3, 9));

        Reminders.Due(device, Plan, At(11, 3, 9, 5)).ShouldBeNull();
        Reminders.Due(device, Plan, At(11, 5, 7))!.Date.ShouldBe(new DateOnly(2026, 11, 5));
    }

    [Fact]
    public void Turned_on_before_todays_time_today_still_counts()
    {
        var device = Device(setUpAt: At(11, 3, 6));

        Reminders.Due(device, Plan, At(11, 3, 7))!.Date.ShouldBe(new DateOnly(2026, 11, 3));
    }

    [Fact]
    public void Moving_the_time_later_after_todays_reminder_never_sends_it_again()
    {
        var device = Device();
        device.MarkReminded(new DateOnly(2026, 11, 3));

        device.Change(new ProtectedPushAddress("e2", "k2", "a2"), new TimeOnly(8, 0), false, At(11, 3, 7, 30));

        Reminders.Due(device, Plan, At(11, 3, 8)).ShouldBeNull();
    }

    [Fact]
    public void On_a_Monday_the_new_week_comes_with_the_run_when_the_runner_wants_it()
    {
        var monday = At(11, 9, 7);

        Reminders.Due(Device(weekAhead: true), Plan, monday).ShouldBe(new Reminder(
            new DateOnly(2026, 11, 9), Reminders.NewWeekTitle, $"Today: Easy run + strides. {Reminders.NewWeekBody}"));
        Reminders.Due(Device(weekAhead: false), Plan, monday)!.Title.ShouldBe(Reminders.RunTitle);
    }

    [Fact]
    public void A_new_week_on_a_rest_Monday_still_says_so()
    {
        var plan = Plan with
        {
            Weeks = [Plan.Weeks[0], Plan.Weeks[1] with { Sessions = Plan.Weeks[1].Sessions.Skip(1).ToList() }, Plan.Weeks[2]],
        };

        Reminders.Due(Device(weekAhead: true), plan, At(11, 9, 7)).ShouldBe(
            new Reminder(new DateOnly(2026, 11, 9), Reminders.NewWeekTitle, Reminders.NewWeekBody));
        Reminders.Due(Device(weekAhead: false), plan, At(11, 9, 7)).ShouldBeNull();
    }

    [Fact]
    public void The_first_week_and_race_week_have_no_new_week_note()
    {
        // The coach makes no call on either: nothing came before the first, and race week runs as written.
        Reminders.Due(Device(weekAhead: true), Plan, At(11, 2, 7)).ShouldBeNull();
        Reminders.Due(Device(weekAhead: true), Plan, At(11, 16, 7)).ShouldBeNull();
    }

    [Fact]
    public void Without_a_plan_there_is_nothing_to_remind_and_nothing_coming()
    {
        Reminders.Due(Device(), null, At(11, 3, 7)).ShouldBeNull();
        Reminders.NextDue(Device(), null, At(11, 3, 7)).ShouldBeNull();
    }

    [Fact]
    public void The_next_reminder_skips_rest_days()
    {
        // Wednesday morning, a rest day: next is Thursday's tempo at 07:00.
        Reminders.NextDue(Device(), Plan, At(11, 4, 8)).ShouldBe(At(11, 5, 7));
    }

    [Fact]
    public void The_next_reminder_is_later_today_before_its_time_and_now_when_its_overdue()
    {
        Reminders.NextDue(Device(), Plan, At(11, 3, 6)).ShouldBe(At(11, 3, 7));
        Reminders.NextDue(Device(), Plan, At(11, 3, 9)).ShouldBe(At(11, 3, 9));
    }

    [Fact]
    public void Once_todays_has_gone_the_next_is_the_next_run_day()
    {
        var device = Device();
        device.MarkReminded(new DateOnly(2026, 11, 3));

        Reminders.NextDue(device, Plan, At(11, 3, 7, 1)).ShouldBe(At(11, 5, 7));
    }

    [Fact]
    public void After_race_day_nothing_more_is_coming()
    {
        var device = Device();
        device.MarkReminded(new DateOnly(2026, 11, 22));

        Reminders.NextDue(device, Plan, At(11, 22, 8)).ShouldBeNull();
        Reminders.NextDue(Device(), Plan, At(11, 23, 7)).ShouldBeNull();
    }

    [Fact]
    public void A_plan_that_starts_far_ahead_is_looked_at_again_after_the_look_ahead()
    {
        var setUp = new DateTime(2026, 9, 1, 12, 0, 0);

        Reminders.NextDue(Device(setUpAt: setUp), Plan, setUp)
            .ShouldBe(DateOnly.FromDateTime(setUp).AddDays(Reminders.LookAheadDays).ToDateTime(Seven));
    }

    [Fact]
    public void A_device_needs_a_runner_a_key_and_its_address()
    {
        var address = new ProtectedPushAddress("e", "k", "a");

        Should.Throw<DomainException>(() => PushSubscription.Start(Guid.Empty, new string('a', 64), address, Seven, false, At(11, 1, 9)));
        Should.Throw<DomainException>(() => PushSubscription.Start(Guid.NewGuid(), "short", address, Seven, false, At(11, 1, 9)));
        Should.Throw<DomainException>(() => PushSubscription.Start(Guid.NewGuid(), new string('a', 64), address with { Auth = "" }, Seven, false, At(11, 1, 9)));
    }
}
