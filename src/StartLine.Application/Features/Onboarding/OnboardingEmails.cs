using System.Text;
using StartLine.Application.Features.Insights;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Onboarding;

/// <summary>
/// The onboarding emails, in Taperday's look (<see cref="EmailLayout"/>), each with a plain-text copy. Encouraging, never
/// guilt: a runner who hasn't recorded a run may well be running, so the copy never says they aren't. Nothing about their
/// running goes in: only their first name, if they gave one. A runner's copy unsubscribes from news and updates, the list
/// these belong to; the weekly recap has its own list and is never touched.
/// </summary>
public static class OnboardingEmail
{
    private sealed record Copy(string Subject, string Kicker, string Title, string Preheader, string[] Paragraphs, string Button, string Path, string Why);

    private static Copy For(OnboardingCampaign campaign) => campaign switch
    {
        OnboardingCampaign.StartPlan => new(
            "Your starting line is waiting",
            "Your first step · Taperday",
            "Your starting line is waiting.",
            "Two minutes, a few answers, and a plan that fits your week.",
            [
                "You joined Taperday a little while ago, and your first plan is still waiting to be built.",
                "Pick a race, or just a distance and a date, and the days you can run. You'll get a week-by-week plan with paces that suit you, and it adjusts as you go.",
                "No race in mind? Choose a distance and a date a few months out. A plan to finish is as good a goal as any.",
            ],
            "Build my training plan",
            "/?view=build",
            "You're getting this because you have a Taperday account with news and updates on. It's a one-off: we won't send it again."),
        OnboardingCampaign.FirstRun => new(
            "Your first run is waiting",
            "Your first run · Taperday",
            "Your first run is waiting.",
            "Your plan is ready. Even a short, easy run counts.",
            [
                "Your plan is ready for you. The first session is the hardest one to start, and it doesn't have to be fast or long: an easy run at a pace you could chat at is exactly right.",
                "Already been out? Tick the session off in your plan, or upload the run, so your plan can keep up with you.",
            ],
            "Open my plan",
            "/?view=home",
            "You're getting this because you have a Taperday account with news and updates on. It's a one-off: we won't send it again."),
        OnboardingCampaign.ReturnToRunning => new(
            "Ready when you are",
            "Checking in · Taperday",
            "Ready when you are.",
            "Your plan can pick up from wherever you are now.",
            [
                "It's been a few weeks since you last recorded a run in Taperday. If you've been running elsewhere, or taking a well-earned break, that's completely fine.",
                "Whenever you'd like to pick it back up, your plan can start again from where you are: rebuild the weeks ahead around a missed stretch, or build a fresh plan for a new goal.",
            ],
            "Pick up my plan",
            "/?view=home",
            "You're getting this because you have a Taperday account with news and updates on. We won't send another unless you run again and then go quiet for a while."),
        _ => throw new ArgumentOutOfRangeException(nameof(campaign)),
    };

    public static string Subject(OnboardingCampaign campaign) => For(campaign).Subject;

    /// <summary>The button's address on taperday.run: the plan builder for a runner without a plan, otherwise Home.</summary>
    public static Uri Link(OnboardingCampaign campaign) => new(EmailLayout.Site + For(campaign).Path);

    /// <summary>
    /// One runner's email. With <paramref name="unsubscribe"/> (a runner's own news-and-updates key) the footer and the
    /// one-click header stop that list; a preview has none, so its footer goes to Account.
    /// </summary>
    public static EmailMessage Compose(string to, OnboardingCampaign campaign, string? displayName, UnsubscribeLinks? unsubscribe, bool test = false)
    {
        var copy = For(campaign);
        var greeting = FirstName(displayName) is { } first ? $"Hi {first}." : "Hi there.";
        var link = Link(campaign).AbsoluteUri;

        var body = new StringBuilder(EmailLayout.Paragraph(greeting));
        foreach (var paragraph in copy.Paragraphs)
        {
            body.Append(EmailLayout.Paragraph(paragraph));
        }

        var html = EmailLayout.Wrap(
            preheader: copy.Preheader,
            kicker: copy.Kicker,
            title: copy.Title,
            body: body.ToString(),
            buttonText: copy.Button,
            buttonUrl: link,
            footer: EmailLayout.Encode(copy.Why),
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri);

        var text = new StringBuilder();
        text.Append(copy.Title).Append("\n\n").Append(greeting).Append("\n\n");
        foreach (var paragraph in copy.Paragraphs)
        {
            text.Append(paragraph).Append("\n\n");
        }

        text.Append(copy.Button).Append(": ").Append(link).Append("\n\n").Append(copy.Why).Append('\n');
        text.Append(unsubscribe is null
            ? "\nTurn emails off in Account: " + EmailLayout.Site + "/?view=account\n"
            : "\nUnsubscribe from Taperday news and updates (other emails stay as they are): " + unsubscribe.Page.AbsoluteUri + "\n");
        text.Append("\nTaperday · taperday.run · hello@taperday.run\n");

        return new EmailMessage(to, (test ? "[Test] " : "") + copy.Subject, html, text.ToString(), unsubscribe);
    }

    /// <summary>
    /// A made-up runner's copy for checking how it looks: a sample name, no runner's data, no unsubscribe key, and
    /// "[Test]" in the subject. It's composed for whoever is set to receive previews, never from the database.
    /// </summary>
    public static EmailMessage Preview(string to, OnboardingCampaign campaign) => Compose(to, campaign, "Sample Runner", unsubscribe: null, test: true);

    /// <summary>The first word of the display name, when it looks like a name (not an email address); otherwise null.</summary>
    public static string? FirstName(string? displayName)
    {
        var first = displayName?.Trim().Split((char[]?)null, 2, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return first is null || first.Contains('@', StringComparison.Ordinal) ? null : first;
    }
}
