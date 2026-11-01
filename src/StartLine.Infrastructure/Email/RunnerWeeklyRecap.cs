using System.Globalization;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure.Email;

/// <summary>Runner-facing recap, built exclusively from the opted-in runner's visible weekly records.</summary>
internal static class RunnerWeeklyRecap
{
    public static EmailMessage Compose(string to, string displayName, DateOnly weekStart, int runs, double kilometres, bool test)
    {
        var date = weekStart.ToString("d MMM", CultureInfo.InvariantCulture);
        var km = Math.Round(kilometres, 1).ToString("0.#", CultureInfo.InvariantCulture);
        var intro = runs == 0 ? "A quiet week still counts. Your plan is here when you're ready." : "Your miles, your progress. Here's what you recorded.";
        var name = string.IsNullOrWhiteSpace(displayName) ? "runner" : displayName.Trim();
        var body = EmailLayout.Paragraph($"Hi {name}. {intro}", muted: true)
            + EmailLayout.Figures(("Runs", runs.ToString(CultureInfo.InvariantCulture)), ("Distance", $"{km} km"))
            + EmailLayout.Heading("The week ahead")
            + EmailLayout.Paragraph("Open your plan to see what's next. If life interrupted training, you can preview an adjustment before choosing to apply it.", muted: true);
        var html = EmailLayout.Wrap(
            preheader: $"Your Taperday week: {runs} runs, {km} km.",
            kicker: $"Your running week · {date}",
            title: runs == 0 ? "Every new week is a fresh start." : "Look how far you've come.",
            body: body,
            buttonText: "View my training",
            buttonUrl: EmailLayout.Site,
            footer: "Your personal weekly running recap. Turn weekly emails off anytime in Account settings.");
        var plain = $"Hi {name}.\n\nYour week from {date}: {runs} runs, {km} km.\n\n{intro}\n\nCheck your upcoming sessions or preview changes to your plan at https://taperday.run.\n\nTo stop these emails, turn off weekly emails in Taperday Account settings.";
        return new EmailMessage(to, (test ? "[Test] " : "") + "Your Taperday running week", html, plain);
    }
}
