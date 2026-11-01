using StartLine.Application.Features.Onboarding;
using StartLine.Domain.Runners;

namespace StartLine.Application.Tests.Onboarding;

/// <summary>
/// Who's due which onboarding email, as pure rules on fixed facts and a fixed clock: the three cohorts and their order,
/// the waits, what holds an email back, and what's gone before.
/// </summary>
public sealed class OnboardingEligibilityTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    private static OnboardingFacts Joined(DateTimeOffset at) => new(at, null, null, null, HasEmail: true, AcceptsUpdates: true);

    private static OnboardingFacts WithPlan(DateTimeOffset joined, DateTimeOffset plan) => Joined(joined) with { FirstPlanAt = plan, LatestPlanAt = plan };

    private static OnboardingCampaign? Classify(OnboardingFacts facts) => OnboardingEligibility.Classify(facts, Now)?.Campaign;

    private static DateOnly Day(DateTimeOffset at) => DateOnly.FromDateTime(at.UtcDateTime);

    [Fact]
    public void A_runner_without_a_plan_is_invited_at_48_hours_and_not_a_minute_before()
    {
        Classify(Joined(Now.AddHours(-48).AddMinutes(1))).ShouldBeNull();
        Classify(Joined(Now.AddHours(-48))).ShouldBe(OnboardingCampaign.StartPlan);
        Classify(Joined(Now.AddDays(-400))).ShouldBe(OnboardingCampaign.StartPlan);
    }

    [Fact]
    public void Any_saved_plan_even_one_made_at_48_hours_or_since_archived_ends_the_first_cohort()
    {
        // A plan made at the 48-hour mark: they're past "build a plan", and too new for "your first run".
        Classify(WithPlan(Now.AddHours(-48), Now)).ShouldBeNull();
        // An archived plan is still a saved plan: the facts carry the first plan ever, whatever its status now.
        Classify(WithPlan(Now.AddDays(-30), Now.AddDays(-29))).ShouldBe(OnboardingCampaign.FirstRun);
    }

    [Fact]
    public void Opt_out_and_missing_email_suppress_every_cohort()
    {
        OnboardingFacts[] each =
        [
            Joined(Now.AddDays(-30)),
            WithPlan(Now.AddDays(-30), Now.AddDays(-20)),
            WithPlan(Now.AddDays(-90), Now.AddDays(-90)) with { LastRecordedRunOn = Day(Now.AddDays(-40)) },
        ];
        foreach (var facts in each)
        {
            Classify(facts).ShouldNotBeNull();
            Classify(facts with { AcceptsUpdates = false }).ShouldBeNull();
            Classify(facts with { HasEmail = false }).ShouldBeNull();
        }
    }

    [Fact]
    public void A_plan_and_no_run_recorded_is_the_second_cohort_from_seven_days()
    {
        Classify(WithPlan(Now.AddDays(-20), Now.AddDays(-7).AddMinutes(1))).ShouldBeNull();
        Classify(WithPlan(Now.AddDays(-20), Now.AddDays(-7))).ShouldBe(OnboardingCampaign.FirstRun);
        OnboardingEligibility.Classify(WithPlan(Now.AddDays(-20), Now.AddDays(-7)), Now)!.Episode.ShouldBe("");
    }

    [Fact]
    public void Recorded_runs_then_three_quiet_weeks_is_the_third_cohort_with_the_last_run_as_its_episode()
    {
        var active = WithPlan(Now.AddMonths(-4), Now.AddMonths(-4));
        // Quiet counts from the end of the last day with a run.
        Classify(active with { LastRecordedRunOn = Day(Now.AddDays(-20)) }).ShouldBeNull();
        var decision = OnboardingEligibility.Classify(active with { LastRecordedRunOn = new DateOnly(2026, 10, 10) }, Now);
        decision.ShouldBe(new OnboardingDecision(OnboardingCampaign.ReturnToRunning, "2026-10-10"));
    }

    [Fact]
    public void Old_accounts_are_eligible_in_whichever_cohort_they_are_in()
    {
        var joined = Now.AddYears(-1);
        Classify(Joined(joined)).ShouldBe(OnboardingCampaign.StartPlan);
        Classify(WithPlan(joined, joined.AddDays(1))).ShouldBe(OnboardingCampaign.FirstRun);
        Classify(WithPlan(joined, joined.AddDays(1)) with { LastRecordedRunOn = Day(joined.AddDays(10)) }).ShouldBe(OnboardingCampaign.ReturnToRunning);
    }

    [Fact]
    public void Cohorts_are_exclusive_and_taken_in_order()
    {
        // Runs uploaded but never a plan: the next step is still a plan.
        Classify(Joined(Now.AddDays(-60)) with { LastRecordedRunOn = Day(Now.AddDays(-50)) }).ShouldBe(OnboardingCampaign.StartPlan);
        // Too new for the first email is never a reason to send a later one.
        Classify(Joined(Now.AddHours(-2)) with { LastRecordedRunOn = Day(Now.AddDays(-90)) }).ShouldBeNull();
        // Any recorded run means never "your first run".
        Classify(WithPlan(Now.AddDays(-60), Now.AddDays(-60)) with { LastRecordedRunOn = Day(Now.AddDays(-5)) }).ShouldBeNull();
    }

    [Fact]
    public void Running_from_before_signing_up_or_a_new_plan_is_not_a_quiet_spell()
    {
        // Joined last week and uploaded old runs: not "it's been a while".
        Classify(WithPlan(Now.AddDays(-7), Now.AddDays(-6)) with { LastRecordedRunOn = Day(Now.AddDays(-90)) }).ShouldBeNull();
        // Built a new plan last week after a long gap: quiet counts from the new plan.
        Classify(WithPlan(Now.AddDays(-200), Now.AddDays(-200)) with { LatestPlanAt = Now.AddDays(-7), LastRecordedRunOn = Day(Now.AddDays(-100)) }).ShouldBeNull();
    }

    [Fact]
    public void Strava_runs_in_the_cache_or_an_unreachable_Strava_hold_back_the_no_run_emails()
    {
        var neverRan = WithPlan(Now.AddDays(-40), Now.AddDays(-30));
        var wentQuiet = neverRan with { LastRecordedRunOn = Day(Now.AddDays(-30)) };
        foreach (var facts in new[] { neverRan, wentQuiet })
        {
            Classify(facts).ShouldNotBeNull();
            Classify(facts with { HasSyncedRunsNow = true }).ShouldBeNull();
            Classify(facts with { SyncSourceUnavailable = true }).ShouldBeNull();
        }

        // Without a plan, synced runs change nothing: the email is about building one.
        Classify(Joined(Now.AddDays(-30)) with { HasSyncedRunsNow = true }).ShouldBe(OnboardingCampaign.StartPlan);
    }

    [Fact]
    public void Other_onboarding_emails_keep_a_two_week_gap_and_only_ones_that_may_have_gone_count()
    {
        var firstRun = new OnboardingDecision(OnboardingCampaign.FirstRun);
        PastOnboardingEmail Start(int daysAgo, bool gone = true) => new(OnboardingCampaign.StartPlan, "", Now.AddDays(-daysAgo), gone);

        OnboardingEligibility.Allowed(firstRun, [], Now).ShouldBeTrue();
        OnboardingEligibility.Allowed(firstRun, [Start(13)], Now).ShouldBeFalse();
        OnboardingEligibility.Allowed(firstRun, [Start(14)], Now).ShouldBeTrue();
        OnboardingEligibility.Allowed(firstRun, [Start(1, gone: false)], Now).ShouldBeTrue();
        // Its own row is the claim's business (a retry), not a reason to hold it back.
        OnboardingEligibility.Allowed(firstRun, [new(OnboardingCampaign.FirstRun, "", Now.AddDays(-1), false)], Now).ShouldBeTrue();
    }

    [Fact]
    public void Ready_when_you_are_needs_fresh_running_and_sixty_days_since_the_last_one()
    {
        var episode = new OnboardingDecision(OnboardingCampaign.ReturnToRunning, "2026-10-01");
        PastOnboardingEmail Return(string ep, int daysAgo) => new(OnboardingCampaign.ReturnToRunning, ep, Now.AddDays(-daysAgo), true);

        // The same quiet spell (or one from before it, if history was edited) never gets a second nudge.
        OnboardingEligibility.Allowed(episode with { Episode = "2026-09-01" }, [Return("2026-10-01", 100)], Now).ShouldBeFalse();
        // Fresh running since, but within the cooldown.
        OnboardingEligibility.Allowed(episode, [Return("2026-07-01", 59)], Now).ShouldBeFalse();
        OnboardingEligibility.Allowed(episode, [Return("2026-07-01", 60)], Now).ShouldBeTrue();
    }

    [Fact]
    public void The_budget_keeps_room_for_the_weekly_recap_and_the_day_and_run_limits()
    {
        var budget = new OnboardingBudget(MaxPerRun: 5, DailyLimit: 40, DailyEmailBudget: 250);
        budget.Allowance(0, 0, 0).ShouldBe(5);
        budget.Allowance(38, 0, 0).ShouldBe(2);
        budget.Allowance(40, 0, 0).ShouldBe(0);
        // 200 recaps sent today and 48 runners with the recap on leaves 2 under the day's budget.
        budget.Allowance(0, 200, 48).ShouldBe(2);
        budget.Allowance(10, 300, 100).ShouldBe(0);
        OnboardingBudget.Default.DailyEmailBudget.ShouldBeLessThan(300);
    }
}
