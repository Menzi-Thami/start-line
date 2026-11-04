using System.Text;

namespace StartLine.Application.Features.Insights;

/// <summary>
/// Release-gated preview/composition of the runner-facing UI refresh announcement.
/// This class NEVER sends email. A separate, approved, idempotent broadcast is needed after the release is live.
/// </summary>
public static class UiRefreshAnnouncement
{
    public const string Subject = "Same training. A whole new view.";

    /// <summary>
    /// Images are intentionally optional until genuine, matching before-and-after production screenshots exist.
    /// Only approved first-party HTTPS images on taperday.run may be used, to avoid third-party tracking.
    /// </summary>
    public static EmailMessage Compose(
        string to,
        bool test = false,
        UnsubscribeLinks? unsubscribe = null,
        string? beforeImageUrl = null,
        string? afterImageUrl = null)
    {
        var body = new StringBuilder();
        body.Append(EmailLayout.Paragraph("We’ve been giving Taperday a little more room to breathe. Not to change how you train — to make the things that matter easier to find."));
        body.Append(EmailLayout.Paragraph("Less digging around. More time doing what you came here to do: run."));

        if (IsApprovedPair(beforeImageUrl, afterImageUrl))
        {
            body.Append(EmailLayout.Heading("See the difference"));
            body.Append(EmailLayout.Paragraph("Your week, before and after. Same plan, a clearer way to see it."));
            body.Append(Screenshot("Before", beforeImageUrl!));
            body.Append(Screenshot("After", afterImageUrl!));
        }

        body.Append(EmailLayout.Heading("What feels better"));
        body.Append(EmailLayout.Item("Your week, at a glance", "See the days ahead without scrolling through every workout detail."));
        body.Append(EmailLayout.Item("The full picture, one tap away", "Open a day to see exactly what’s planned, then get back to your week."));
        body.Append(EmailLayout.Item("Every run has its story", "Find your run, see what you did, and understand how it fits your plan."));
        body.Append(EmailLayout.Item("Progress you can actually see", "Clearer charts and easy-to-spot completed sessions help you follow the work you’re putting in."));
        body.Append(EmailLayout.Heading("Why we changed it"));
        body.Append(EmailLayout.Paragraph("Training is hard enough. Finding your next run shouldn’t be. We wanted Taperday to feel calmer, clearer and more at home on your phone or laptop."));
        body.Append(EmailLayout.Paragraph("Your plan and the runs you’ve recorded stay yours. We’re changing the view, not asking you to start over."));

        var html = EmailLayout.Wrap(
            preheader: "A clearer week, easier run details and progress that’s simpler to follow.",
            kicker: "A fresh look at Taperday",
            title: Subject,
            body: body.ToString(),
            buttonText: "See my Taperday",
            buttonUrl: EmailLayout.Site + "/?view=home",
            footer: "You’re receiving this because you have a Taperday account.",
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri);

        var plain = new StringBuilder();
        plain.AppendLine(Subject).AppendLine();
        plain.AppendLine("We’ve given Taperday a little more room to breathe. Less digging around, more time running.").AppendLine();
        plain.AppendLine("WHAT FEELS BETTER");
        plain.AppendLine("- Your week at a glance: see the days ahead without scrolling through every detail.");
        plain.AppendLine("- Full day details: see exactly what’s planned with one tap.");
        plain.AppendLine("- Runs with more meaning: understand how a run fits your plan.");
        plain.AppendLine("- Clearer progress: spot completed sessions and see your training take shape.").AppendLine();
        if (IsApprovedPair(beforeImageUrl, afterImageUrl))
        {
            plain.AppendLine("See the difference:");
            plain.AppendLine("Before: " + beforeImageUrl);
            plain.AppendLine("After: " + afterImageUrl).AppendLine();
        }
        plain.AppendLine("Why? Training is hard enough. Finding your next run shouldn’t be.");
        plain.AppendLine("Your plan and recorded runs stay yours. You don’t have to start again.").AppendLine();
        plain.AppendLine("Open Taperday: " + EmailLayout.Site + "/?view=home");
        plain.AppendLine(unsubscribe is null
            ? "Manage email preferences in Account: " + EmailLayout.Site + "/?view=account"
            : "Unsubscribe from Taperday news and updates: " + unsubscribe.Page.AbsoluteUri);

        return new EmailMessage(to, (test ? "[Test] " : "") + Subject, html, plain.ToString(), unsubscribe);
    }

    private static bool IsApprovedPair(string? before, string? after) => Approved(before) && Approved(after);

    private static bool Approved(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps
        && uri.Host.Equals("taperday.run", StringComparison.OrdinalIgnoreCase)
        && uri.AbsolutePath.StartsWith("/email/ui-refresh/", StringComparison.Ordinal)
        && string.IsNullOrEmpty(uri.UserInfo)
        && uri.Query.Length == 0
        && uri.Fragment.Length == 0;

    private static string Screenshot(string label, string url) =>
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 16px;\"><tr><td style=\"font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#666;padding:0 0 6px;\">"
        + EmailLayout.Encode(label)
        + "</td></tr><tr><td><img src=\"" + EmailLayout.Encode(url)
        + "\" alt=\"" + EmailLayout.Encode(label + " Taperday weekly schedule screenshot")
        + "\" width=\"500\" style=\"display:block;width:100%;max-width:500px;height:auto;border:1px solid #e2e2e2;border-radius:16px;\" /></td></tr></table>";
}
