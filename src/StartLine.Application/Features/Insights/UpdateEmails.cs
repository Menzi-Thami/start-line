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
        ("Five tabs, zero hunting", "Home, Plan, Runs, Progress and Account live along the bottom of your phone, or down the side on a laptop. One tap and you're there."),
        ("Today, front and centre", "Open Taperday and your next run is right there, with your week, your race countdown and your latest run."),
        ("A plan you can read at a glance", "Jump to any week, see every workout on the calendar, and tap a day for its warm-up, main set and cool-down."),
        ("Progress gets its own lane", "Compare your last 4, 8 or 12 weeks and watch your consistency stack up."),
        ("Your race, found", "Search any race by name or town. The big ones still hang on the race rack."),
        ("Night Run mode", "Switch your phone to dark and Taperday goes near-black and volt. Made for those 5am starts."),
    ];

    /// <summary>
    /// The maker's preview of a campaign: a made-up copy marked [Test], with no runner's details and no unsubscribe key.
    /// Null for a campaign Taperday doesn't know.
    /// </summary>
    public static EmailMessage? Preview(string campaign, string to) => campaign switch
    {
        RedesignCampaign => TaperdayRedesign(to, "Thami", test: true),
        SignInOutageCampaign => SignInOutage(to, "Thami", test: true),
        _ => null,
    };

    private const string OutageOpening = "If you've tried to sign in to Taperday today and your sign-in code never turned up, it isn't you, and it isn't your inbox.";
    private const string OutageCause = "Taperday's sign-in codes are sent by Microsoft, which looks after our sign-in. Microsoft is having an outage today that's delaying or stopping those emails, whatever email you use. They're working on it, and codes will start arriving again once it's fixed.";

    private static readonly (string Title, string Detail)[] OutageSteps =
    [
        ("Already signed in? Stay that way", "Taperday remembers you on your phone or laptop, so you can keep using it as normal. Just don't sign out until this is fixed."),
        ("Signed out and use Gmail?", "Tap Continue with Google on the sign-in page. It doesn't need a code. If it still asks for one, it's best to wait for Microsoft's fix."),
        ("Otherwise, give it a little time", "Once Microsoft is back to normal, ask for a new code and it'll arrive as usual."),
    ];

    private const string OutageClosing = "Your plan, your runs and your Strava connection are all safe. Nothing's lost, and there's nothing you need to change. Sorry for the hassle.";
    private const string OutageSubject = "Not getting your Taperday sign-in code? Here's why";

    /// <summary>The 13 November 2026 sign-in code outage notice's campaign name, kept in each runner's delivery record.</summary>
    public const string SignInOutageCampaign = "sign-in-outage-2026-11-13";

    /// <summary>
    /// A heads-up during Microsoft's email outage of 13 November 2026: sign-in codes aren't arriving, why, and what to do
    /// meanwhile. With <paramref name="unsubscribe"/> (a runner's copy) the footer and headers offer a way out of updates; a
    /// preview to the maker has none.
    /// </summary>
    public static EmailMessage SignInOutage(string to, string? name = null, bool test = false, UnsubscribeLinks? unsubscribe = null)
    {
        var greeting = string.IsNullOrWhiteSpace(name) ? "Hi there," : $"Hi {name.Trim()},";
        var body = new StringBuilder();
        body.Append(EmailLayout.Paragraph(greeting));
        body.Append(EmailLayout.Paragraph(OutageOpening));
        body.Append(EmailLayout.Paragraph(OutageCause));
        body.Append(EmailLayout.Heading("What you can do"));
        foreach (var (title, detail) in OutageSteps)
        {
            body.Append(EmailLayout.Item(title, detail));
        }

        body.Append(EmailLayout.Paragraph(OutageClosing));

        var html = EmailLayout.Wrap(
            preheader: "Microsoft's outage is holding up sign-in codes. Your plan and runs are safe.",
            kicker: "Heads-up · Signing in today",
            title: "Your code's stuck in traffic.",
            body: body.ToString(),
            buttonText: "Open Taperday",
            buttonUrl: EmailLayout.Site + "/?view=home",
            footer: "You're getting this because you said yes to Taperday news and updates. Your weekly recap isn't affected.",
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri);

        var text = new StringBuilder("Your code's stuck in traffic.\n\n").Append(greeting).Append("\n\n").Append(OutageOpening).Append("\n\n").Append(OutageCause).Append("\n\nWhat you can do\n");
        foreach (var (title, detail) in OutageSteps)
        {
            text.Append("- ").Append(title).Append(": ").Append(detail).Append('\n');
        }

        text.Append('\n').Append(OutageClosing).Append("\n\nOpen Taperday: https://taperday.run/?view=home\n");
        if (unsubscribe is not null)
        {
            text.Append("\nUnsubscribe from Taperday news and updates (your weekly recap isn't affected): ").Append(unsubscribe.Page.AbsoluteUri).Append('\n');
        }

        return new EmailMessage(to, (test ? "[Test] " : "") + OutageSubject, html, text.ToString(), unsubscribe);
    }

    private const string RedesignOpening = "We've been doing some training of our own. Taperday is simpler, quicker, and a lot easier on the eyes. Same coach, new kit.";
    private const string RedesignClosing = "Your plan, your runs and your Strava connection are exactly where you left them. Nothing to set up. Just lace up.";
    private const string RedesignSubject = "Fresh legs, fresh look: meet the new Taperday";

    /// <summary>The redesign announcement's campaign name, kept in each runner's delivery record.</summary>
    public const string RedesignCampaign = "redesign-2026-11";

    /// <summary>
    /// The November 2026 redesign, told with a bit of fun: a simpler, fresher Taperday, what's new, and that the runner's
    /// plan and runs are where they left them. With <paramref name="unsubscribe"/> (a runner's copy) the footer and headers
    /// offer a way out of updates; a preview to the maker has none.
    /// </summary>
    public static EmailMessage TaperdayRedesign(string to, string? name = null, bool test = false, UnsubscribeLinks? unsubscribe = null)
    {
        var greeting = string.IsNullOrWhiteSpace(name) ? "Hi there," : $"Hi {name.Trim()},";
        var body = new StringBuilder();
        body.Append(EmailLayout.Paragraph(greeting));
        body.Append(EmailLayout.Paragraph(RedesignOpening));
        body.Append(EmailLayout.Heading("What's new"));
        foreach (var (title, detail) in RedesignChanges)
        {
            body.Append(EmailLayout.Item(title, detail));
        }

        body.Append(EmailLayout.Paragraph(RedesignClosing));

        var html = EmailLayout.Wrap(
            preheader: "Simpler, quicker, and it now runs in the dark.",
            kicker: "What's new · A brand-new look",
            title: "Fresh legs. Fresh look.",
            body: body.ToString(),
            buttonText: "Take it for a spin",
            buttonUrl: EmailLayout.Site + "/?view=home",
            footer: "You're getting this because you said yes to Taperday news and updates. Your weekly recap isn't affected.",
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri);

        var text = new StringBuilder("Fresh legs. Fresh look.\n\n").Append(greeting).Append("\n\n").Append(RedesignOpening).Append("\n\n");
        foreach (var (title, detail) in RedesignChanges)
        {
            text.Append("- ").Append(title).Append(": ").Append(detail).Append('\n');
        }

        text.Append('\n').Append(RedesignClosing).Append("\n\nTake it for a spin: https://taperday.run/?view=home\n");
        if (unsubscribe is not null)
        {
            text.Append("\nUnsubscribe from Taperday news and updates (your weekly recap isn't affected): ").Append(unsubscribe.Page.AbsoluteUri).Append('\n');
        }

        return new EmailMessage(to, (test ? "[Test] " : "") + RedesignSubject, html, text.ToString(), unsubscribe);
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
