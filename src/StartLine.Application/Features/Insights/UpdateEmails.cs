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
