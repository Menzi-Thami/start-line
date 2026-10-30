using StartLine.Domain.Common;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Notifications;

/// <summary>Which reminder a device is due, when, and what it says: from the plan, the runner's own clock and units.</summary>
public sealed class ReminderTests
{
    private static readonly TimeOnly Seven = new(7, 0);

    private static PaceRange Range(int fastest, int slowest) =>
        new(Pace.FromSecondsPerKilometre(fastest), Pace.FromSecondsPerKilometre(slowest));

    // A three-week 5K plan. Week 1 starts Monday 2 November; race week starts Monday 16 November; the race is Sunday 22nd.
    private static readonly TrainingPlan Plan = new(
        Distance.FiveK,
        DistanceCategory.FiveK,
        new DateOnly(2026, 11, 22),
        TimeSpan.FromMinutes(25),
        new DateOnly(2026, 11, 2),
        new Dictionary<PaceZone, PaceRange>
        {
            [PaceZone.Easy] = Range(350, 380),
            [PaceZone.Tempo] = Range(290, 300),
            [PaceZone.Interval] = Range(270, 280),
            [PaceZone.LongRun] = Range(355, 385),
            [PaceZone.Race] = Range(300, 300),
        },
        [
            Week(1, new DateOnly(2026, 11, 2), TrainingPhase.Base,
                Run(new DateOnly(2026, 11, 3), SessionType.Easy, "Easy run", 6, PaceZone.Easy, "Conversational effort."),
                Run(new DateOnly(2026, 11, 4), SessionType.Strength, "Strength", 0),
                Run(new DateOnly(2026, 11, 5), SessionType.Tempo, "Tempo run", 8, PaceZone.Tempo, "Warm up, then 20 min at tempo pace."),
                Run(new DateOnly(2026, 11, 5), SessionType.Strength, "Strength", 0),
                Run(new DateOnly(2026, 11, 7), SessionType.LongRun, "Long run", 10, PaceZone.LongRun, "Steady and easy.")),
            Week(2, new DateOnly(2026, 11, 9), TrainingPhase.Build,
                Run(new DateOnly(2026, 11, 9), SessionType.EasyWithStrides, "Easy run + strides", 6, PaceZone.Easy, "Easy, then strides."),
                Run(new DateOnly(2026, 11, 11), SessionType.Intervals, "Intervals", 7, PaceZone.Interval, "6 × 800 m."),
                Run(new DateOnly(2026, 11, 14), SessionType.LongRun, "Long run", 12, PaceZone.LongRun, "Steady and easy.")),
            Week(3, new DateOnly(2026, 11, 16), TrainingPhase.RaceWeek,
                Run(new DateOnly(2026, 11, 17), SessionType.Easy, "Easy run", 5, PaceZone.Easy, "Conversational effort."),
                Run(new DateOnly(2026, 11, 21), SessionType.Shakeout, "Shakeout", 3, PaceZone.Easy, "Loosen up."),
                Run(new DateOnly(2026, 11, 22), SessionType.Race, "Race day", 5, PaceZone.Race, "5 km. Start at goal pace, not faster.")),
        ],
        []);

    private static readonly ReminderFacts Facts = new(Plan, Units.Kilometres);

    private static PlanWeek Week(int number, DateOnly start, TrainingPhase phase, params PlannedSession[] sessions) =>
        new(number, start, phase, false, sessions);

    private static PlannedSession Run(DateOnly date, SessionType type, string title, double km, PaceZone? zone = null, string detail = "") =>
        new(date, type, title, detail, "", km, zone);

    private static DateTime At(int month, int day, int hour, int minute = 0) => new(2026, month, day, hour, minute, 0);

    /// <summary>A device set up the evening before the plan starts, so nothing is marked yet.</summary>
    private static PushSubscription Device(TimeOnly? remindAt = null, bool weekAhead = false, DateTime? setUpAt = null) =>
        PushSubscription.Start(Guid.NewGuid(), new string('a', PushSubscription.DeviceKeyLength), new ProtectedPushAddress("e", "k", "a"),
            remindAt ?? Seven, weekAhead, setUpAt ?? At(11, 1, 20));

    [Fact]
    public void A_run_day_reminds_at_the_chosen_time_and_not_before()
    {
        var device = Device();

        Reminders.Due(device, Facts, At(11, 3, 6, 59)).ShouldBeNull();
        Reminders.Due(device, Facts, At(11, 3, 7)).ShouldBe(
            new Reminder(new DateOnly(2026, 11, 3), "Today: Easy run", "6 km at 5:50–6:20/km. Conversational effort."));
    }

    [Fact]
    public void The_reminder_gives_the_session_with_its_distance_and_pace()
    {
        Reminders.Due(Device(), Facts, At(11, 5, 7)).ShouldBe(
            new Reminder(new DateOnly(2026, 11, 5), "Today: Tempo run", "8 km at 4:50–5:00/km. Warm up, then 20 min at tempo pace."));
    }

    [Fact]
    public void A_runner_in_miles_gets_miles()
    {
        Reminders.Due(Device(), Facts with { Units = Units.Miles }, At(11, 3, 7))!.Body
            .ShouldBe("3.7 mi at 9:23–10:12/mi. Conversational effort.");
    }

    [Fact]
    public void A_rest_day_has_no_reminder_and_strength_alone_is_not_a_run()
    {
        var device = Device();

        Reminders.Due(device, Facts, At(11, 2, 9)).ShouldBeNull();
        Reminders.Due(device, Facts, At(11, 4, 9)).ShouldBeNull();
    }

    [Fact]
    public void Race_day_gives_the_plan_for_the_race_and_the_goal_pace()
    {
        Reminders.Due(Device(), Facts, At(11, 22, 7)).ShouldBe(new Reminder(
            new DateOnly(2026, 11, 22), Reminders.RaceTitle, "5 km. Start at goal pace, not faster. Goal pace 5:00/km."));
    }

    [Fact]
    public void A_late_check_still_sends_the_days_reminder_that_day()
    {
        // The app slept through 07:00; the first check is that evening.
        Reminders.Due(Device(), Facts, At(11, 3, 22, 30))!.Date.ShouldBe(new DateOnly(2026, 11, 3));
    }

    [Fact]
    public void A_day_missed_altogether_is_not_sent_the_next_day()
    {
        // Asleep all Thursday (the tempo); Friday is a rest day, so Friday has nothing, and Thursday's is gone.
        Reminders.Due(Device(), Facts, At(11, 6, 9)).ShouldBeNull();
    }

    [Fact]
    public void A_reminder_already_sent_today_is_never_sent_again()
    {
        var device = Device();
        var reminder = Reminders.Due(device, Facts, At(11, 3, 7))!;

        device.MarkReminded(reminder.Date);

        Reminders.Due(device, Facts, At(11, 3, 7, 5)).ShouldBeNull();
        Reminders.Due(device, Facts, At(11, 3, 23, 59)).ShouldBeNull();
        Should.Throw<DomainException>(() => device.MarkReminded(reminder.Date));
    }

    [Fact]
    public void Turned_on_after_todays_time_the_first_reminder_is_tomorrows()
    {
        // 09:00 on a run day, reminders at 07:00: nothing straight away.
        var device = Device(setUpAt: At(11, 3, 9));

        Reminders.Due(device, Facts, At(11, 3, 9, 5)).ShouldBeNull();
        Reminders.Due(device, Facts, At(11, 5, 7))!.Date.ShouldBe(new DateOnly(2026, 11, 5));
    }

    [Fact]
    public void Turned_on_before_todays_time_today_still_counts()
    {
        Reminders.Due(Device(setUpAt: At(11, 3, 6)), Facts, At(11, 3, 7))!.Date.ShouldBe(new DateOnly(2026, 11, 3));
    }

    [Fact]
    public void Moving_the_time_later_after_todays_reminder_never_sends_it_again()
    {
        var device = Device();
        device.MarkReminded(new DateOnly(2026, 11, 3));

        device.Change(new ProtectedPushAddress("e2", "k2", "a2"), new TimeOnly(8, 0), false, At(11, 3, 7, 30));

        Reminders.Due(device, Facts, At(11, 3, 8)).ShouldBeNull();
    }

    [Fact]
    public void On_a_Monday_the_new_week_comes_with_last_week_this_week_and_today()
    {
        var facts = Facts with { LastWeek = new LastWeek(RunsPlanned: 3, RunsDone: 2, KmPlanned: 24) };

        var reminder = Reminders.Due(Device(weekAhead: true), facts, At(11, 9, 7))!;

        reminder.Title.ShouldBe("Week 2 of 3 · Build");
        reminder.Body.ShouldBe(
            $"{WeekGuidance.For(Plan.Weeks[1])} Last week you checked in 2 of 3 runs. "
            + "This week: 25 km, with Intervals on Wednesday and a 12 km long run on Saturday. Today: Easy run + strides, 6 km.");
    }

    [Fact]
    public void With_run_data_the_new_week_leads_with_the_coachs_call_and_the_distance_run()
    {
        var facts = Facts with
        {
            LastWeek = new LastWeek(RunsPlanned: 3, RunsDone: 3, KmPlanned: 24, KmRun: 23.4),
            CoachSays = "Strong week. Last week went to plan.",
        };

        Reminders.Due(Device(weekAhead: true), facts, At(11, 9, 7))!.Body.ShouldStartWith(
            "Coach: Strong week. Last week went to plan. Last week: 3 of 3 runs, 23.4 km of 24 km. This week: 25 km");
    }

    [Fact]
    public void Without_any_check_ins_last_week_says_nothing_rather_than_none()
    {
        // Runs may have been recorded but not checked in; without run data the reminder can't know, so it doesn't say.
        var facts = Facts with { LastWeek = new LastWeek(RunsPlanned: 3, RunsDone: 0, KmPlanned: 24) };

        Reminders.Due(Device(weekAhead: true), facts, At(11, 9, 7))!.Body.ShouldNotContain("Last week");
    }

    [Fact]
    public void Without_the_new_week_choice_a_Monday_is_just_the_run()
    {
        Reminders.Due(Device(weekAhead: false), Facts, At(11, 9, 7))!.Title.ShouldBe("Today: Easy run + strides");
    }

    [Fact]
    public void A_new_week_on_a_rest_Monday_still_says_so()
    {
        var plan = Plan with
        {
            Weeks = [Plan.Weeks[0], Plan.Weeks[1] with { Sessions = Plan.Weeks[1].Sessions.Skip(1).ToList() }, Plan.Weeks[2]],
        };

        var reminder = Reminders.Due(Device(weekAhead: true), Facts with { Plan = plan }, At(11, 9, 7))!;

        reminder.Title.ShouldBe("Week 2 of 3 · Build");
        reminder.Body.ShouldNotContain("Today:");
        Reminders.Due(Device(weekAhead: false), Facts with { Plan = plan }, At(11, 9, 7)).ShouldBeNull();
    }

    [Fact]
    public void The_first_week_and_race_week_have_no_new_week_note()
    {
        // The coach makes no call on either: nothing came before the first, and race week runs as written.
        Reminders.Due(Device(weekAhead: true), Facts, At(11, 2, 7)).ShouldBeNull();
        Reminders.Due(Device(weekAhead: true), Facts, At(11, 16, 7)).ShouldBeNull();
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
