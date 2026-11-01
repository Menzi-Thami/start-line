using StartLine.Application.Features.Insights;

namespace StartLine.Application.Features.Onboarding;

/// <summary>Onboarding cohorts are mutually exclusive. A durable send ledger is required
/// before enabling any automatic delivery, so this classifier does not send email.</summary>
public enum OnboardingKind { None, StartPlan, LogFirstRun, ReturnToRunning }

public sealed record OnboardingFacts(
    DateTimeOffset RegisteredAt,
    bool HasEverSavedPlan,
    DateTimeOffset? FirstPlanAt,
    bool HasEverRecordedRun,
    DateTimeOffset? LastActivityAt,
    bool HasEligibleEmail,
    bool AcceptsUpdates);

public static class OnboardingEligibility
{
    public static OnboardingKind Classify(OnboardingFacts facts, DateTimeOffset now)
    {
        if (!facts.HasEligibleEmail || !facts.AcceptsUpdates || facts.RegisteredAt > now)
            return OnboardingKind.None;

        if (!facts.HasEverSavedPlan && now - facts.RegisteredAt >= TimeSpan.FromHours(48))
            return OnboardingKind.StartPlan;

        if (facts.HasEverSavedPlan && !facts.HasEverRecordedRun &&
            facts.FirstPlanAt is { } first && now - first >= TimeSpan.FromDays(7))
            return OnboardingKind.LogFirstRun;

        if (facts.HasEverRecordedRun && facts.LastActivityAt is { } last &&
            now - last >= TimeSpan.FromDays(21))
            return OnboardingKind.ReturnToRunning;

        return OnboardingKind.None;
    }
}

/// <summary>Original branded onboarding copy. Never embed real runner activity
/// details in a preview; link to the app, not to a guessed saved-plan identifier.</summary>
public static class OnboardingEmail
{
    public static string Subject(OnboardingKind kind) => kind switch
    {
        OnboardingKind.StartPlan => "Your starting line is waiting",
        OnboardingKind.LogFirstRun => "Your first run is waiting",
        OnboardingKind.ReturnToRunning => "Ready to get moving again?",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    public static string Message(OnboardingKind kind) => kind switch
    {
        OnboardingKind.StartPlan => "Whether you're working towards your first 5K or something bigger, we'll help you find a plan that fits your week. No pressure. Just a first step.",
        OnboardingKind.LogFirstRun => "Your plan is ready for you. Even a short, easy run counts as showing up. Take the first session at your own pace, and log it when you're back.",
        OnboardingKind.ReturnToRunning => "It's been a little while since you recorded a run here. If you've been running elsewhere, that's great too. Your plan is here whenever you'd like to pick it up.",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };

    public static string Html(OnboardingKind kind, string displayName, string? unsubscribeUrl) =>
        EmailLayout.Wrap(
            preheader: Message(kind),
            kicker: "Your next step · Taperday",
            title: Subject(kind) + ".",
            body: EmailLayout.Paragraph("Hi " + (string.IsNullOrWhiteSpace(displayName) ? "runner" : displayName.Trim()) + ". " + Message(kind)),
            buttonText: kind == OnboardingKind.StartPlan ? "Build my training plan" : "Open Taperday",
            buttonUrl: EmailLayout.Site + (kind == OnboardingKind.StartPlan ? "/?view=build" : "/?view=home"),
            footer: "You're receiving this because you signed up for Taperday. You can turn updates off at any time.",
            unsubscribeUrl: unsubscribeUrl);

    public static string PlainText(OnboardingKind kind, string? unsubscribeUrl) =>
        Subject(kind) + "\n\n" + Message(kind) + "\n\n" + EmailLayout.Site +
        (unsubscribeUrl is null ? "\n\nManage emails from Account." : "\n\nUnsubscribe: " + unsubscribeUrl);
}
