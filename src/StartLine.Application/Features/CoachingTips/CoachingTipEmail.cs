using System.Globalization;
using System.Text;
using StartLine.Application.Features.Insights;
using StartLine.Application.Features.Onboarding;

namespace StartLine.Application.Features.CoachingTips;

/// <summary>
/// The Thursday coaching tip, in Taperday's look (<see cref="EmailLayout"/>), with a plain-text copy: one tip and one button
/// into the app. It's part of the runner's weekly emails, so a runner's copy carries their weekly key, which stops the
/// Monday recap and the tip together and nothing else.
/// </summary>
public static class CoachingTipEmail
{
    public const string Button = "Open this week";
    public const string Why = "Part of your weekly emails from Taperday: a recap on Mondays and a coaching tip on Thursdays. Stop both any time with the button below, or in Account.";

    private static readonly CultureInfo En = CultureInfo.GetCultureInfo("en-GB");

    public static string Subject(CoachingTip tip)
    {
        ArgumentNullException.ThrowIfNull(tip);
        return "Your Taperday tip: " + tip.Title;
    }

    /// <summary>One runner's tip. With <paramref name="unsubscribe"/> (their weekly key) the footer and one-click header stop the weekly emails.</summary>
    public static EmailMessage Compose(string to, CoachingTip tip, DateOnly thursday, string? displayName, UnsubscribeLinks? unsubscribe, bool test = false)
    {
        ArgumentNullException.ThrowIfNull(tip);
        var greeting = OnboardingEmail.FirstName(displayName) is { } first ? $"Hi {first}." : "Hi there.";
        var title = tip.Title.EndsWith('?') || tip.Title.EndsWith('.') ? tip.Title : tip.Title + ".";

        var body = new StringBuilder(EmailLayout.Paragraph(greeting));
        body.Append(EmailLayout.Paragraph(tip.Body));
        var html = EmailLayout.Wrap(
            preheader: FirstSentence(tip.Body),
            kicker: $"Your Thursday tip · {thursday.ToString("d MMMM", En)}",
            title: title,
            body: body.ToString(),
            buttonText: Button,
            buttonUrl: EmailLayout.Site,
            footer: EmailLayout.Encode(Why),
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri,
            unsubscribeFrom: EmailLayout.WeeklyEmails);

        var text = new StringBuilder();
        text.Append(title).Append("\n\n").Append(greeting).Append("\n\n").Append(tip.Body).Append("\n\n");
        text.Append(Button).Append(": ").Append(EmailLayout.Site).Append("\n\n").Append(Why).Append('\n');
        text.Append(unsubscribe is null
            ? "\nTurn emails off in Account: " + EmailLayout.Site + "/?view=account\n"
            : "\nStop your weekly emails (the Monday recap and the Thursday tip): " + unsubscribe.Page.AbsoluteUri + "\n");
        text.Append("\nTaperday · taperday.run · hello@taperday.run\n");

        return new EmailMessage(to, (test ? "[Test] " : "") + Subject(tip), html, text.ToString(), unsubscribe);
    }

    /// <summary>
    /// Made-up copies for checking how they look, to whoever is set to receive previews: the first tip of each track and
    /// the long-run jump with sample numbers. A sample name, no runner's data, no unsubscribe key and "[Test]" in the subject.
    /// </summary>
    public static IReadOnlyList<EmailMessage> Previews(string to, DateOnly thursday) =>
    [
        Compose(to, CoachingTipBank.NewRunner[0], thursday, "Sample Runner", unsubscribe: null, test: true),
        Compose(to, CoachingTipBank.Improving[0], thursday, "Sample Runner", unsubscribe: null, test: true),
        Compose(to, CoachingTipBank.LongRunJump(14, 12), thursday, "Sample Runner", unsubscribe: null, test: true),
    ];

    private static string FirstSentence(string body)
    {
        var end = body.IndexOf(". ", StringComparison.Ordinal);
        return end < 0 ? body : body[..(end + 1)];
    }
}
