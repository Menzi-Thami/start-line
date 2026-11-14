using StartLine.Domain.Journey;

namespace StartLine.Domain.Tests.Journey;

public class RecoveryGeneratorTests
{
    private static readonly DateOnly Race = new(2026, 11, 1);

    private static readonly RecoveryDayKind[] AllowedKinds =
    [
        RecoveryDayKind.RaceDay, RecoveryDayKind.Rest, RecoveryDayKind.Walk, RecoveryDayKind.Mobility,
        RecoveryDayKind.CrossTraining, RecoveryDayKind.EasyRun, RecoveryDayKind.SeekCare, RecoveryDayKind.Paused,
    ];

    private static RecoverySchedule Build(
        double km = 21.1,
        RecoveryEffort effort = RecoveryEffort.Hard,
        RecoveryPreference preference = RecoveryPreference.Walk,
        IReadOnlyList<RecoveryCheckIn>? checkIns = null,
        IReadOnlyList<RecoveryPause>? pauses = null,
        int extraDays = 0,
        DateOnly? today = null,
        DateOnly? race = null,
        IReadOnlyList<DayOfWeek>? runDays = null) =>
        RecoveryGenerator.Build(
            new RecoveryInputs(km, race ?? Race, effort, preference, runDays ?? [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday],
                extraDays, pauses ?? [], checkIns ?? []),
            today ?? race ?? Race);

    private static RecoveryCheckIn Feeling(RecoveryFeeling feeling, DateOnly? on = null, params RecoveryRedFlag[] flags) => new(on ?? Race, feeling, flags, null);

    [Fact]
    public void The_generator_is_version_one() => RecoveryGenerator.Version.ShouldBe(1);

    [Theory]
    [InlineData(5, RecoveryCategory.FiveK)]
    [InlineData(6, RecoveryCategory.FiveK)]
    [InlineData(6.1, RecoveryCategory.TenK)]
    [InlineData(12, RecoveryCategory.TenK)]
    [InlineData(21.1, RecoveryCategory.Half)]
    [InlineData(25, RecoveryCategory.Half)]
    [InlineData(42.2, RecoveryCategory.Marathon)]
    [InlineData(56, RecoveryCategory.Ultra)]
    [InlineData(60, RecoveryCategory.Ultra)]
    [InlineData(90, RecoveryCategory.LongUltra)]
    public void The_category_follows_the_distance(double km, RecoveryCategory category) => RecoveryGenerator.CategoryOf(km).ShouldBe(category);

    [Theory]
    [InlineData(RecoveryCategory.FiveK, RecoveryEffort.Easy, 1, 1, 1)]
    [InlineData(RecoveryCategory.FiveK, RecoveryEffort.Hard, 1, 1, 1)]
    [InlineData(RecoveryCategory.FiveK, RecoveryEffort.AllOut, 1, 1, 1)]
    [InlineData(RecoveryCategory.TenK, RecoveryEffort.Easy, 1, 2, 2)]
    [InlineData(RecoveryCategory.TenK, RecoveryEffort.Hard, 1, 2, 2)]
    [InlineData(RecoveryCategory.TenK, RecoveryEffort.AllOut, 1, 3, 3)]
    [InlineData(RecoveryCategory.Half, RecoveryEffort.Easy, 2, 2, 4)]
    [InlineData(RecoveryCategory.Half, RecoveryEffort.Hard, 2, 3, 5)]
    [InlineData(RecoveryCategory.Half, RecoveryEffort.AllOut, 3, 4, 6)]
    [InlineData(RecoveryCategory.Marathon, RecoveryEffort.Easy, 2, 5, 9)]
    [InlineData(RecoveryCategory.Marathon, RecoveryEffort.Hard, 3, 6, 12)]
    [InlineData(RecoveryCategory.Marathon, RecoveryEffort.AllOut, 4, 8, 15)]
    [InlineData(RecoveryCategory.Ultra, RecoveryEffort.Easy, 4, 7, 11)]
    [InlineData(RecoveryCategory.Ultra, RecoveryEffort.Hard, 5, 9, 14)]
    [InlineData(RecoveryCategory.Ultra, RecoveryEffort.AllOut, 6, 11, 18)]
    [InlineData(RecoveryCategory.LongUltra, RecoveryEffort.Easy, 5, 8, 13)]
    [InlineData(RecoveryCategory.LongUltra, RecoveryEffort.Hard, 7, 11, 17)]
    [InlineData(RecoveryCategory.LongUltra, RecoveryEffort.AllOut, 9, 14, 21)]
    public void Effort_scales_every_phase_of_each_category(RecoveryCategory category, RecoveryEffort effort, int rest, int gentle, int easy) =>
        RecoveryGenerator.PhaseDays(category, effort).ShouldBe((rest, gentle, easy));

    [Theory]
    [InlineData(5, "about 2–4 days")]
    [InlineData(10, "about 3–7 days")]
    [InlineData(21.1, "about 7–14 days")]
    [InlineData(42.2, "about 2–4 weeks")]
    [InlineData(56, "several weeks, individual")]
    [InlineData(89, "several weeks, individual")]
    public void Each_category_has_its_framing_and_its_days_run_from_race_day_to_the_end_of_easy_return(double km, string framing)
    {
        foreach (var effort in Enum.GetValues<RecoveryEffort>())
        {
            var schedule = Build(km, effort);
            var (rest, gentle, easy) = RecoveryGenerator.PhaseDays(schedule.Category, effort);
            schedule.Framing.ShouldBe(framing);
            schedule.Days.Count.ShouldBe(1 + rest + gentle + easy);
            schedule.Days[0].ShouldSatisfyAllConditions(d => d.Kind.ShouldBe(RecoveryDayKind.RaceDay), d => d.Date.ShouldBe(Race), d => d.Optional.ShouldBeFalse());
            schedule.EndsOn.ShouldBe(Race.AddDays(rest + gentle + easy));
            schedule.Days.Skip(1).Count(d => d.Phase == RecoveryPhase.Rest).ShouldBe(rest);
        }
    }

    [Fact]
    public void Without_a_check_in_nothing_goes_beyond_gentle_movement()
    {
        var schedule = Build(42.2, today: Race.AddDays(30));

        schedule.Readiness.ShouldBe(RecoveryReadinessState.NotCheckedIn);
        schedule.Days.ShouldAllBe(d => d.Phase != RecoveryPhase.EasyReturn);
        schedule.Days.ShouldNotContain(d => d.Kind == RecoveryDayKind.EasyRun);
        schedule.Days.ShouldContain(d => d.Kind == RecoveryDayKind.Walk);
        schedule.CanComplete.ShouldBeFalse();
    }

    [Fact]
    public void Good_to_go_opens_easy_running_after_rest_and_gentle_movement_and_allows_finishing()
    {
        var schedule = Build(21.1, checkIns: [Feeling(RecoveryFeeling.GoodToGo)]);

        var easyReturn = schedule.Days.Where(d => d.Phase == RecoveryPhase.EasyReturn).ToList();
        easyReturn.Count.ShouldBe(5);
        easyReturn.ShouldContain(d => d.Kind == RecoveryDayKind.EasyRun);
        schedule.Days.Where(d => d.Kind == RecoveryDayKind.EasyRun).ShouldAllBe(d => d.Phase == RecoveryPhase.EasyReturn);
        schedule.Readiness.ShouldBe(RecoveryReadinessState.GoodToGo);
        schedule.CanComplete.ShouldBeTrue();
        schedule.SeekCare.ShouldBeFalse();
    }

    [Theory]
    [InlineData(RecoveryFeeling.NotSure)]
    [InlineData(RecoveryFeeling.StillSore)]
    public void Not_sure_or_still_sore_keeps_to_gentle_movement(RecoveryFeeling feeling)
    {
        var schedule = Build(42.2, checkIns: [Feeling(feeling)]);

        schedule.Days.Skip(1).ShouldAllBe(d => d.Phase == RecoveryPhase.Rest || d.Phase == RecoveryPhase.Gentle);
        schedule.Days.ShouldNotContain(d => d.Kind == RecoveryDayKind.EasyRun);
        schedule.CanComplete.ShouldBeFalse();
    }

    [Fact]
    public void Very_fatigued_keeps_to_rest()
    {
        var schedule = Build(42.2, checkIns: [Feeling(RecoveryFeeling.VeryFatigued)]);

        schedule.Days.Skip(1).ShouldAllBe(d => d.Phase == RecoveryPhase.Rest);
        schedule.Days.Skip(1).ShouldAllBe(d => d.Kind == RecoveryDayKind.Rest || d.Kind == RecoveryDayKind.Walk);
        schedule.Days.Where(d => d.Kind == RecoveryDayKind.Walk).ShouldAllBe(d => d.MaxMinutes <= 20);
    }

    [Fact]
    public void Pain_or_injury_means_seek_care_with_no_exercise()
    {
        var schedule = Build(21.1, checkIns: [Feeling(RecoveryFeeling.PainOrInjury)]);

        schedule.SeekCare.ShouldBeTrue();
        schedule.SafetyMessage.ShouldNotBeNullOrWhiteSpace();
        schedule.CanComplete.ShouldBeFalse();
        schedule.Days.Skip(1).ShouldAllBe(d => d.Kind == RecoveryDayKind.SeekCare && d.MinMinutes == null && d.MaxMinutes == null);
    }

    public static TheoryData<RecoveryRedFlag> RedFlags() => [.. Enum.GetValues<RecoveryRedFlag>()];

    [Theory]
    [MemberData(nameof(RedFlags))]
    public void Any_red_flag_means_seek_care_with_no_exercise_even_when_good_to_go(RecoveryRedFlag flag)
    {
        var schedule = Build(42.2, checkIns: [Feeling(RecoveryFeeling.GoodToGo, Race.AddDays(1), flag)], today: Race.AddDays(1));

        schedule.SeekCare.ShouldBeTrue();
        schedule.Phase.ShouldBe(RecoveryPhase.SeekCare);
        schedule.SafetyMessage.ShouldNotBeNullOrWhiteSpace();
        schedule.CanComplete.ShouldBeFalse();
        schedule.Days.Where(d => d.Date >= Race.AddDays(1)).ShouldAllBe(d => d.Kind == RecoveryDayKind.SeekCare && d.MaxMinutes == null);
    }

    [Theory]
    [InlineData(RecoveryRedFlag.ChestPain)]
    [InlineData(RecoveryRedFlag.Fainting)]
    [InlineData(RecoveryRedFlag.DarkUrine)]
    public void The_most_serious_signs_ask_for_urgent_help(RecoveryRedFlag flag) =>
        Build(checkIns: [Feeling(RecoveryFeeling.NotSure, Race, flag)]).SafetyMessage!.ShouldContain("urgent");

    [Fact]
    public void A_later_check_in_lifts_seek_care_but_only_from_its_own_day()
    {
        var schedule = Build(42.2, checkIns: [Feeling(RecoveryFeeling.PainOrInjury, Race.AddDays(1)), Feeling(RecoveryFeeling.StillSore, Race.AddDays(4))], today: Race.AddDays(4));

        schedule.Days.Where(d => d.Date >= Race.AddDays(1) && d.Date < Race.AddDays(4)).ShouldAllBe(d => d.Kind == RecoveryDayKind.SeekCare);
        schedule.Days.Where(d => d.Date >= Race.AddDays(4)).ShouldNotContain(d => d.Kind == RecoveryDayKind.SeekCare);
        schedule.SeekCare.ShouldBeFalse();
    }

    [Fact]
    public void The_schedule_never_escalates_after_a_worse_check_in_and_easy_runs_start_short_again()
    {
        var good = Feeling(RecoveryFeeling.GoodToGo, Race.AddDays(9));
        var sore = Feeling(RecoveryFeeling.StillSore, Race.AddDays(16));
        var goodAgain = Feeling(RecoveryFeeling.GoodToGo, Race.AddDays(18));
        var schedule = Build(42.2, checkIns: [good, sore, goodAgain], today: Race.AddDays(18));

        schedule.Days.Where(d => d.Date >= sore.Date && d.Date < goodAgain.Date).ShouldAllBe(d => d.Phase != RecoveryPhase.EasyReturn);
        var firstAgain = schedule.Days.First(d => d.Date >= goodAgain.Date && d.Kind == RecoveryDayKind.EasyRun);
        (firstAgain.MinMinutes, firstAgain.MaxMinutes).ShouldBe((15, 20));
    }

    [Fact]
    public void Easy_runs_ramp_from_short_to_at_most_45_minutes_on_up_to_half_the_run_days()
    {
        var schedule = Build(89, RecoveryEffort.AllOut, checkIns: [Feeling(RecoveryFeeling.GoodToGo)]);
        var runs = schedule.Days.Where(d => d.Kind == RecoveryDayKind.EasyRun).ToList();

        (runs[0].MinMinutes, runs[0].MaxMinutes).ShouldBe((15, 20));
        runs.ShouldAllBe(r => r.MaxMinutes <= 45 && r.MinMinutes >= 15);
        runs[^1].MaxMinutes.ShouldBe(45);
        runs.Select(r => r.MaxMinutes).ShouldBeInOrder();
        // Four run days: two easy runs a week, never back to back.
        runs.GroupBy(r => r.Date.AddDays(-(((int)r.Date.DayOfWeek + 6) % 7))).ShouldAllBe(w => w.Count() <= 2);
        runs.Zip(runs.Skip(1)).ShouldAllBe(p => p.Second.Date.DayNumber - p.First.Date.DayNumber > 1);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 2)]
    [InlineData(3, 2)]
    [InlineData(4, 2)]
    [InlineData(5, 3)]
    [InlineData(6, 3)]
    [InlineData(7, 3)]
    public void Easy_return_uses_up_to_half_the_run_days_two_or_three_a_week(int runDays, int perWeek) =>
        RecoveryGenerator.EasyRunsPerWeek(runDays).ShouldBe(perWeek);

    [Fact]
    public void No_day_is_ever_outside_the_allowed_kinds_or_longer_than_45_minutes()
    {
        RecoveryCheckIn?[] answers = [null, .. Enum.GetValues<RecoveryFeeling>().Select(f => (RecoveryCheckIn?)Feeling(f))];
        var cases = from km in new[] { 5, 10, 21.1, 42.2, 56, 89 }
                    from effort in Enum.GetValues<RecoveryEffort>()
                    from preference in Enum.GetValues<RecoveryPreference>()
                    from answer in answers
                    select (km, effort, preference, answer);
        foreach (var (km, effort, preference, answer) in cases)
        {
            var schedule = Build(km, effort, preference, answer is null ? [] : [answer], extraDays: 14);
            schedule.Days.ShouldAllBe(d => AllowedKinds.Contains(d.Kind));
            schedule.Days.ShouldAllBe(d => d.MaxMinutes == null || d.MaxMinutes <= RecoveryGenerator.MaxMinutes);
            schedule.Days.Where(d => d.Kind is not (RecoveryDayKind.RaceDay or RecoveryDayKind.SeekCare)).ShouldAllBe(d => d.Optional);
            schedule.Days.ShouldAllBe(d => !d.Title.Contains("tempo", StringComparison.OrdinalIgnoreCase)
                && !d.Title.Contains("interval", StringComparison.OrdinalIgnoreCase)
                && !d.Title.Contains("long run", StringComparison.OrdinalIgnoreCase)
                && !d.Guidance.Contains("min/km", StringComparison.OrdinalIgnoreCase));
        }
    }

    [Fact]
    public void Rest_preference_gives_rest_days_and_mobility_rather_than_walks()
    {
        var schedule = Build(42.2, preference: RecoveryPreference.Rest, checkIns: [Feeling(RecoveryFeeling.NotSure)]);

        schedule.Days.Where(d => d.Phase == RecoveryPhase.Rest).ShouldAllBe(d => d.Kind == RecoveryDayKind.Rest);
        schedule.Days.ShouldContain(d => d.Kind == RecoveryDayKind.Mobility && d.MinMinutes == 10 && d.MaxMinutes == 15);
        schedule.Days.ShouldNotContain(d => d.Kind == RecoveryDayKind.Walk);
    }

    [Fact]
    public void Cross_training_preference_offers_very_light_cross_training_in_the_gentle_phase()
    {
        var schedule = Build(42.2, preference: RecoveryPreference.CrossTraining);

        schedule.Days.Where(d => d.Phase == RecoveryPhase.Gentle && d.Kind != RecoveryDayKind.Rest)
            .ShouldAllBe(d => d.Kind == RecoveryDayKind.CrossTraining && d.MinMinutes == 20 && d.MaxMinutes == 30);
    }

    [Fact]
    public void Paused_days_do_not_move_the_recovery_on_and_push_the_end_back()
    {
        var plain = Build(21.1, checkIns: [Feeling(RecoveryFeeling.GoodToGo)]);
        var paused = Build(21.1, checkIns: [Feeling(RecoveryFeeling.GoodToGo)], pauses: [new RecoveryPause(Race.AddDays(3), Race.AddDays(6))]);

        paused.EndsOn.ShouldBe(plain.EndsOn.AddDays(3));
        paused.Days.Where(d => d.Kind == RecoveryDayKind.Paused).Select(d => d.Date).ShouldBe([Race.AddDays(3), Race.AddDays(4), Race.AddDays(5)]);
        paused.Days.Single(d => d.Date == Race.AddDays(6)).Phase.ShouldBe(plain.Days.Single(d => d.Date == Race.AddDays(3)).Phase);
    }

    [Fact]
    public void An_open_pause_covers_up_to_today_and_the_rest_follows_from_tomorrow()
    {
        var today = Race.AddDays(5);
        var schedule = Build(21.1, pauses: [new RecoveryPause(Race.AddDays(2), null)], today: today);

        schedule.Phase.ShouldBe(RecoveryPhase.Paused);
        schedule.Days.Where(d => d.Kind == RecoveryDayKind.Paused).Select(d => d.Date).ShouldBe([Race.AddDays(2), Race.AddDays(3), Race.AddDays(4), today]);
        schedule.Days.Single(d => d.Date == today.AddDays(1)).Kind.ShouldNotBe(RecoveryDayKind.Paused);
    }

    [Fact]
    public void Extra_days_lengthen_easy_return()
    {
        var plain = Build(21.1);
        var longer = Build(21.1, extraDays: 4);

        longer.EasyReturnDays.ShouldBe(plain.EasyReturnDays + 4);
        longer.EndsOn.ShouldBe(plain.EndsOn.AddDays(4));
        (longer.RestDays, longer.GentleDays).ShouldBe((plain.RestDays, plain.GentleDays));
    }

    [Fact]
    public void Days_still_to_come_that_wait_for_good_to_go_are_marked_gated()
    {
        var today = Race.AddDays(2);
        var schedule = Build(21.1, checkIns: [Feeling(RecoveryFeeling.StillSore, today)], today: today);

        var easyReturnDays = schedule.Days.Skip(1 + schedule.RestDays + schedule.GentleDays).ToList();
        easyReturnDays.ShouldAllBe(d => d.Gated && d.Phase == RecoveryPhase.Gentle);
        schedule.Days.Take(1 + schedule.RestDays + schedule.GentleDays).ShouldAllBe(d => !d.Gated);

        var ready = Build(21.1, checkIns: [Feeling(RecoveryFeeling.GoodToGo, today)], today: today);
        ready.Days.ShouldAllBe(d => !d.Gated);
    }

    [Fact]
    public void A_race_near_a_daylight_saving_change_stays_on_its_local_date()
    {
        // Clocks change in Europe on 29 March 2026 and in the US on 1 November 2026.
        foreach (var race in new[] { new DateOnly(2026, 3, 29), new DateOnly(2026, 3, 28), new DateOnly(2026, 11, 1), new DateOnly(2026, 10, 25) })
        {
            var schedule = Build(42.2, race: race, today: race);
            schedule.Days[0].Date.ShouldBe(race);
            schedule.DayNumber.ShouldBe(0);
            schedule.Days.Select((d, i) => d.Date == race.AddDays(i) && d.DayNumber == i).ShouldAllBe(ok => ok);
        }
    }

    [Fact]
    public void Day_number_counts_days_since_the_race()
    {
        Build(today: Race.AddDays(3)).DayNumber.ShouldBe(3);
        Build(today: Race).Phase.ShouldBe(RecoveryPhase.RaceDay);
    }
}
