using System.Globalization;
using System.Text;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Insights;

/// <summary>"Send feedback" from the app: saved for the maker, and in the Monday report.</summary>
public sealed record SendFeedbackCommand(string Message, string? Page) : IRequest<bool>;

internal sealed class SendFeedbackValidator : AbstractValidator<SendFeedbackCommand>
{
    public SendFeedbackValidator()
    {
        RuleFor(c => c.Message).NotEmpty().MaximumLength(Feedback.MaxMessageLength);
        RuleFor(c => c.Page).MaximumLength(Feedback.MaxPageLength);
    }
}

internal sealed class SendFeedbackHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time) : IRequestHandler<SendFeedbackCommand, bool>
{
    public async Task<bool> Handle(SendFeedbackCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        db.Feedback.Add(Feedback.From(runner.Id, request.Message, request.Page, time.GetUtcNow()));
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}

/// <summary>A note as the maker reads it: what was said, where and when. Never who, beyond what they chose to write.</summary>
public sealed record FeedbackNoteDto(string Message, string Page, DateTimeOffset At);

/// <summary>
/// How Taperday is doing, in counts only: who signed up, how far they got (a plan, their runs, Strava, reminders), who ran
/// this week, and the past week's feedback. No names or emails.
/// </summary>
public sealed record InsightsDto(
    int Runners,
    int NewThisWeek,
    int WithCurrentPlan,
    int WithRuns,
    int StravaConnected,
    int RemindersOn,
    int RanThisWeek,
    int Runs,
    IReadOnlyList<FeedbackNoteDto> Feedback);

/// <summary>The Monday report: the counts, as an email for the maker.</summary>
public static class WeeklyReport
{
    public static async Task<InsightsDto> CountAsync(IApplicationDbContext db, DateTimeOffset now, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);
        var weekAgo = now.AddDays(-7);
        var weekAgoDate = DateOnly.FromDateTime(weekAgo.UtcDateTime);
        return new InsightsDto(
            await db.Runners.CountAsync(cancellationToken),
            await db.Runners.CountAsync(r => r.CreatedAt >= weekAgo, cancellationToken),
            await db.SavedPlans.Where(p => p.Status == SavedPlanStatus.Active).Select(p => p.RunnerId).Distinct().CountAsync(cancellationToken),
            await db.Activities.Select(a => a.RunnerId).Distinct().CountAsync(cancellationToken),
            await db.ProviderConnections.Select(c => c.RunnerId).Distinct().CountAsync(cancellationToken),
            await db.PushSubscriptions.Select(s => s.RunnerId).Distinct().CountAsync(cancellationToken),
            await db.Activities.Where(a => a.LocalDate >= weekAgoDate).Select(a => a.RunnerId).Distinct().CountAsync(cancellationToken),
            await db.Activities.CountAsync(cancellationToken),
            await db.Feedback.AsNoTracking().Where(f => f.CreatedAt >= weekAgo).OrderByDescending(f => f.CreatedAt).Take(50)
                .Select(f => new FeedbackNoteDto(f.Message, f.Page, f.CreatedAt)).ToListAsync(cancellationToken));
    }

    /// <summary>The email, in Taperday's look and voice (<see cref="EmailLayout"/>), with a plain-text copy.</summary>
    public static EmailMessage Compose(InsightsDto s, string to, DateOnly weekOf, bool test = false)
    {
        ArgumentNullException.ThrowIfNull(s);
        var ci = CultureInfo.InvariantCulture;
        double Of(int n) => s.Runners > 0 ? (double)n / s.Runners : 0;
        string Count(int n) => s.Runners > 0 ? string.Create(ci, $"{n} · {Math.Round(100.0 * n / s.Runners)}%") : n.ToString(ci);
        var date = weekOf.ToString("d MMMM yyyy", ci);
        var subject = (test ? "[Test] " : "") + string.Create(ci, $"Your Monday numbers: {s.Runners} runners, {s.RanThisWeek} ran this week");
        var headline = s.NewThisWeek > 0
            ? string.Create(ci, $"{s.NewThisWeek} new {(s.NewThisWeek == 1 ? "runner" : "runners")} joined this week.")
            : "No new runners this week. Steady miles.";

        var steps = new (string Label, int Count)[]
        {
            ("Saved a plan", s.WithCurrentPlan),
            ("Added their runs", s.WithRuns),
            ("Connected Strava", s.StravaConnected),
            ("Turned on reminders", s.RemindersOn),
        };
        var body = new StringBuilder();
        body.Append(EmailLayout.Paragraph(string.Create(ci, $"Week of {date}. {headline}"), muted: true));
        body.Append(EmailLayout.Figures(
            ("Runners", s.Runners.ToString(ci)),
            ("New this week", s.NewThisWeek.ToString(ci)),
            ("Ran this week", s.RanThisWeek.ToString(ci))));
        body.Append(EmailLayout.Heading("How far runners got"));
        foreach (var (label, count) in steps)
        {
            body.Append(EmailLayout.Bar(label, Of(count), Count(count)));
        }

        body.Append(EmailLayout.Paragraph(string.Create(ci, $"{s.Runs} runs stored in all."), muted: true));
        body.Append(EmailLayout.Heading("What runners told you"));
        if (s.Feedback.Count == 0)
        {
            body.Append(EmailLayout.Paragraph("No feedback this week. The Send feedback link is in the footer of every page.", muted: true));
        }

        foreach (var f in s.Feedback)
        {
            body.Append(EmailLayout.Note(f.Message, f.At.ToString("d MMM", ci) + (f.Page.Length > 0 ? $" · {f.Page}" : "")));
        }

        var html = EmailLayout.Wrap(
            preheader: string.Create(ci, $"{s.Runners} runners, {s.NewThisWeek} new, {s.RanThisWeek} ran this week."),
            kicker: "Taperday · Monday numbers",
            title: "Here's how Taperday ran this week.",
            body: body.ToString(),
            buttonText: "Open Taperday",
            buttonUrl: EmailLayout.Site,
            footer: "Your Monday report, just for you as Taperday's maker. Counts only, never names.");

        var text = new StringBuilder();
        text.Append(ci, $"Here's how Taperday ran this week (week of {date}).\n{headline}\n\n");
        text.Append(ci, $"Runners: {s.Runners}\nNew this week: {s.NewThisWeek}\nRan this week: {s.RanThisWeek}\n\nHow far runners got:\n");
        foreach (var (label, count) in steps)
        {
            text.Append(ci, $"- {label}: {Count(count)}\n");
        }

        text.Append(ci, $"\n{s.Runs} runs stored in all.\n\nWhat runners told you:\n");
        if (s.Feedback.Count == 0)
        {
            text.Append("No feedback this week.\n");
        }

        foreach (var f in s.Feedback)
        {
            text.Append(ci, $"- {f.Message} ({f.At.ToString("d MMM", ci)}{(f.Page.Length > 0 ? $" · {f.Page}" : "")})\n");
        }

        return new EmailMessage(to, subject, html, text.Append("\nhttps://taperday.run\n").ToString());
    }
}

/// <summary>
/// One email to one address, as HTML with a plain-text copy. An email to runners that isn't about their own account
/// carries <see cref="Unsubscribe"/>, which the sender turns into the List-Unsubscribe headers mail apps show a button for.
/// </summary>
public sealed record EmailMessage(string To, string Subject, string Html, string Text, UnsubscribeLinks? Unsubscribe = null);

/// <summary>
/// The two ways out of an update email. <see cref="Page"/> is the link in the footer: Taperday's own page, which asks
/// before it unsubscribes, so a mail scanner opening every link can't unsubscribe anyone. <see cref="OneClick"/> is for
/// the List-Unsubscribe header (RFC 8058): the mail app posts to it directly when the runner taps its own button.
/// </summary>
public sealed record UnsubscribeLinks(Uri Page, Uri OneClick)
{
    public static UnsubscribeLinks For(string token, Uri apiBaseUrl)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(token);
        ArgumentNullException.ThrowIfNull(apiBaseUrl);
        var key = Uri.EscapeDataString(token);
        return new(
            new Uri($"{EmailLayout.Site}/?view=unsubscribe&t={key}"),
            new Uri($"{apiBaseUrl.AbsoluteUri.TrimEnd('/')}/api/v1/unsubscribe?t={key}"));
    }
}

/// <summary>What composing an email needs from configuration: the API's public address, for one-click unsubscribe.</summary>
public interface IEmailSettings
{
    Uri ApiBaseUrl { get; }
}

/// <summary>Sends email from hello@taperday.run (Brevo, see docs/email.md). Not configured means nothing is sent.</summary>
public interface IEmailSender
{
    bool Configured { get; }

    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}
