using System.Text;

namespace StartLine.Application.Features.Insights;

/// <summary>
/// "What's new" emails about Taperday itself, in its look (<see cref="EmailLayout"/>). For now they go to the maker as a
/// preview. Sent to runners, each carries its runner's unsubscribe links (<see cref="UpdateBroadcast"/>, docs/email.md).
/// </summary>
public static class UpdateEmails
{
    private static readonly (string Title, string Detail)[] RacePlanV3Changes =
    [
        ("Long runs that go the distance", "Half and marathon long runs now build to about 16 km and 26 km, and never past what you'd cover in about three hours at your easy pace."),
        ("Hard sessions sized to your week", "Tempo, intervals and race-pace runs fit what you're running that week, so a big session never lands in a small one."),
        ("Long tempos as reps", "Late in the plan, a long tempo becomes reps with short jogs between, so you hold the pace instead of fading."),
        ("Two hard days, not three", "On four runs a week or fewer, a long run with goal-pace work counts as a hard day, so the week keeps to two."),
        ("An easier start for new runners", "Your first two weeks are easy running and strides, before any hard session."),
        ("Strength where it helps", "Strength moves off hard days and the day before your long run, so your legs are fresh when it counts."),
    ];

    private static readonly (string Title, string Detail)[] RedesignChanges =
    [
        ("Everything in one tap", "Home, Plan, Runs, Progress and Account sit along the bottom of your phone, or down the side on a laptop."),
        ("Today comes first", "Home opens on your next session, your week, your race countdown and your latest run."),
        ("A clearer plan", "Jump to any week, see every workout on the calendar, and open a day for its warm-up, main set and cool-down."),
        ("Progress has its own page", "Compare your last 4, 8 or 12 weeks, with your consistency and milestones in one place."),
        ("Find your race", "Search races by name or town, as well as the big ones on the race rack."),
        ("Night Run dark mode", "Set your phone to dark and Taperday follows, in near-black and volt."),
    ];

    /// <summary>The redesign announcement's campaign name, kept in each runner's delivery record.</summary>
    public const string RedesignCampaign = "redesign-2026-11";

    /// <summary>
    /// The November 2026 redesign: the new navigation and screens, and that the runner's plan and runs are where they left
    /// them. With <paramref name="unsubscribe"/> (a runner's copy) the footer and headers offer a way out of updates; a
    /// preview to the maker has none.
    /// </summary>
    public static EmailMessage TaperdayRedesign(string to, string? name = null, bool test = false, UnsubscribeLinks? unsubscribe = null)
    {
        var greeting = string.IsNullOrWhiteSpace(name) ? "Hi there," : $"Hi {name.Trim()},";
        var body = new StringBuilder();
        body.Append(EmailLayout.Paragraph(greeting));
        body.Append(EmailLayout.Paragraph("Taperday has a fresh look, and it's quicker to get around."));
        body.Append(EmailLayout.Heading("What's new"));
        foreach (var (title, detail) in RedesignChanges)
        {
            body.Append(EmailLayout.Item(title, detail));
        }

        body.Append(EmailLayout.Paragraph("Your plan, your runs and your Strava connection are exactly where you left them."));
        body.Append(EmailLayout.Paragraph("Signing in keeps it that way: plans now open only for their own runner.", muted: true));

        var html = EmailLayout.Wrap(
            preheader: "Five tabs, a clearer week, and a dark mode made for night runs.",
            kicker: "What's new · A whole new Taperday",
            title: "Same training. A whole new Taperday.",
            body: body.ToString(),
            buttonText: "See what's new",
            buttonUrl: EmailLayout.Site + "/?view=home",
            footer: "You're getting this because you said yes to Taperday news and updates. Your weekly recap isn't affected.",
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri);

        var text = new StringBuilder(greeting).Append("\n\nTaperday has a fresh look, and it's quicker to get around.\n\n");
        foreach (var (title, detail) in RedesignChanges)
        {
            text.Append("- ").Append(title).Append(": ").Append(detail).Append('\n');
        }

        text.Append("\nYour plan, your runs and your Strava connection are exactly where you left them.\n\nSee what's new: https://taperday.run/?view=home\n");
        if (unsubscribe is not null)
        {
            text.Append("\nUnsubscribe from Taperday news and updates (your weekly recap isn't affected): ").Append(unsubscribe.Page.AbsoluteUri).Append('\n');
        }

        return new EmailMessage(to, (test ? "[Test] " : "") + "Same training. A whole new Taperday.", html, text.ToString(), unsubscribe);
    }

    /// <summary>
    /// Race Plan v3: what changed in how Taperday builds plans, and that the weekly coach still adapts. With
    /// <paramref name="unsubscribe"/> (a runner's copy) the footer and headers offer a way out; a preview to the maker has none.
    /// </summary>
    public static EmailMessage RacePlanV3(string to, bool test = false, UnsubscribeLinks? unsubscribe = null)
    {
        var body = new StringBuilder();
        body.Append(EmailLayout.Paragraph("Taperday's plan engine just got its biggest update yet. It now builds plans the way the best coaching books do, and keeps doing what it already did best: changing your week to match how you actually ran."));
        body.Append(EmailLayout.Heading("What's new"));
        foreach (var (title, detail) in RacePlanV3Changes)
        {
            body.Append(EmailLayout.Item(title, detail));
        }

        body.Append(EmailLayout.Heading("Still yours"));
        body.Append(EmailLayout.Paragraph("Every Monday your coach looks at your runs and check-ins, then eases off or steps up the week ahead. Fell behind? Replan from where you are, and your race day stays the same."));
        body.Append(EmailLayout.Paragraph("Plans you already have keep their shape. Build a new plan, or change your answers, to get Race Plan v3.", muted: true));

        var html = EmailLayout.Wrap(
            preheader: "Long runs that go the distance, hard sessions sized to your week, and an easier start for new runners.",
            kicker: "What's new · Race Plan v3",
            title: "Your plan just got smarter.",
            body: body.ToString(),
            buttonText: "Build my plan",
            buttonUrl: EmailLayout.Site,
            footer: "You're getting this because you have a Taperday account.",
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri);

        var text = new StringBuilder("Your plan just got smarter. Race Plan v3 is here.\n\n");
        foreach (var (title, detail) in RacePlanV3Changes)
        {
            text.Append("- ").Append(title).Append(": ").Append(detail).Append('\n');
        }

        text.Append("\nPlans you already have keep their shape. Build a new plan, or change your answers, to get Race Plan v3.\n\nhttps://taperday.run\n");
        if (unsubscribe is not null)
        {
            text.Append("\nUnsubscribe from Taperday news and updates: ").Append(unsubscribe.Page.AbsoluteUri).Append('\n');
        }

        return new EmailMessage(to, (test ? "[Test] " : "") + "Your plan just got smarter: meet Race Plan v3", html, text.ToString(), unsubscribe);
    }
}
