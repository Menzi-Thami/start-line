using StartLine.Application.Features.Onboarding;
using Shouldly;

namespace StartLine.Application.Tests.Onboarding;

public sealed class OnboardingEligibilityTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    private static OnboardingFacts NewRunner(DateTimeOffset joined) =>
        new(joined, false, null, false, null, true, true);

    [Fact]
    public void Waits_48_hours_before_inviting_an_unstarted_runner()
    {
        OnboardingEligibility.Classify(NewRunner(Now.AddHours(-47)), Now).ShouldBe(OnboardingKind.None);
        OnboardingEligibility.Classify(NewRunner(Now.AddHours(-48)), Now).ShouldBe(OnboardingKind.StartPlan);
    }

    [Fact]
    public void Older_signups_with_no_plan_are_eligible()
    {
        OnboardingEligibility.Classify(NewRunner(Now.AddDays(-90)), Now).ShouldBe(OnboardingKind.StartPlan);
    }

    [Fact]
    public void No_run_after_first_plan_becomes_eligible_after_seven_days()
    {
        var runner = NewRunner(Now.AddDays(-20)) with { HasEverSavedPlan = true, FirstPlanAt = Now.AddDays(-7) };
        OnboardingEligibility.Classify(runner, Now).ShouldBe(OnboardingKind.LogFirstRun);
    }

    [Fact]
    public void Old_active_runner_becomes_eligible_after_three_weeks()
    {
        var runner = NewRunner(Now.AddMonths(-4)) with
        {
            HasEverSavedPlan = true, FirstPlanAt = Now.AddMonths(-4),
            HasEverRecordedRun = true, LastActivityAt = Now.AddDays(-21),
        };
        OnboardingEligibility.Classify(runner, Now).ShouldBe(OnboardingKind.ReturnToRunning);
    }

    [Fact]
    public void Opted_out_and_missing_email_never_receive_an_invitation()
    {
        var runner = NewRunner(Now.AddDays(-30));
        OnboardingEligibility.Classify(runner with { AcceptsUpdates = false }, Now).ShouldBe(OnboardingKind.None);
        OnboardingEligibility.Classify(runner with { HasEligibleEmail = false }, Now).ShouldBe(OnboardingKind.None);
    }

    [Fact]
    public void Copy_is_supportive_and_includes_unsubscribe()
    {
        OnboardingEmail.Message(OnboardingKind.ReturnToRunning).ShouldContain("If you've been running elsewhere");
        OnboardingEmail.Html(OnboardingKind.StartPlan, "Runner", "https://taperday.run/unsubscribe").ShouldContain("Unsubscribe");
    }
}
