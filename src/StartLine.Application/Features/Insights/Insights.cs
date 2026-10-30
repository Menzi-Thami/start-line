using System.Globalization;
using System.Net;
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

    /// <summary>The email: a subject with the headline, and the same figures as HTML and plain text.</summary>
    public static EmailMessage Compose(InsightsDto s, string to, DateOnly weekOf, bool test = false)
    {
        ArgumentNullException.ThrowIfNull(s);
        string Share(int n) => s.Runners > 0 ? string.Create(CultureInfo.InvariantCulture, $" ({Math.Round(100.0 * n / s.Runners)}%)") : "";
        var rows = new (string Label, string Value)[]
        {
            ("Runners", s.Runners.ToString(CultureInfo.InvariantCulture) + (s.NewThisWeek > 0 ? string.Create(CultureInfo.InvariantCulture, $" ({s.NewThisWeek} new this week)") : "")),
            ("With a current plan", string.Create(CultureInfo.InvariantCulture, $"{s.WithCurrentPlan}{Share(s.WithCurrentPlan)}")),
            ("With runs on Taperday", string.Create(CultureInfo.InvariantCulture, $"{s.WithRuns}{Share(s.WithRuns)}")),
            ("Strava connected", string.Create(CultureInfo.InvariantCulture, $"{s.StravaConnected}{Share(s.StravaConnected)}")),
            ("Reminders on", string.Create(CultureInfo.InvariantCulture, $"{s.RemindersOn}{Share(s.RemindersOn)}")),
            ("Ran this week", s.RanThisWeek.ToString(CultureInfo.InvariantCulture)),
            ("Runs stored", s.Runs.ToString(CultureInfo.InvariantCulture)),
        };
        var date = weekOf.ToString("d MMMM yyyy", CultureInfo.InvariantCulture);
        var subject = (test ? "[Test] " : "") + string.Create(CultureInfo.InvariantCulture, $"Taperday this week: {s.Runners} runners, {s.NewThisWeek} new, {s.RanThisWeek} ran");

        var html = new StringBuilder();
        html.Append(CultureInfo.InvariantCulture, $"<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#16171a\"><h2 style=\"margin:0 0 4px\">Taperday this week</h2><p style=\"margin:0 0 16px;color:#666\">Week of {date}. Counts only, no names.</p><table style=\"border-collapse:collapse;width:100%\">");
        var text = new StringBuilder();
        text.Append(CultureInfo.InvariantCulture, $"Taperday this week (week of {date})\n\n");
        foreach (var (label, value) in rows)
        {
            html.Append(CultureInfo.InvariantCulture, $"<tr><td style=\"padding:8px;border-bottom:1px solid #eee\">{WebUtility.HtmlEncode(label)}</td><td style=\"padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold\">{WebUtility.HtmlEncode(value)}</td></tr>");
            text.Append(CultureInfo.InvariantCulture, $"{label}: {value}\n");
        }

        html.Append("</table><h3 style=\"margin:24px 0 8px\">Feedback this week</h3>");
        text.Append("\nFeedback this week:\n");
        if (s.Feedback.Count == 0)
        {
            html.Append("<p style=\"color:#666\">None this week.</p>");
            text.Append("None this week.\n");
        }

        foreach (var f in s.Feedback)
        {
            var where = f.Page.Length > 0 ? $" · {f.Page}" : "";
            var when = f.At.ToString("d MMM", CultureInfo.InvariantCulture);
            html.Append(CultureInfo.InvariantCulture, $"<p style=\"border-left:3px solid #d7ff3e;padding-left:8px\">{WebUtility.HtmlEncode(f.Message)}<br><span style=\"color:#666;font-size:12px\">{when}{WebUtility.HtmlEncode(where)}</span></p>");
            text.Append(CultureInfo.InvariantCulture, $"- {f.Message} ({when}{where})\n");
        }

        html.Append("<p style=\"color:#999;font-size:12px;margin-top:24px\">Sent by Taperday every Monday morning.</p></div>");
        return new EmailMessage(to, subject, html.ToString(), text.ToString());
    }
}

/// <summary>One email to one address, as HTML with a plain-text copy.</summary>
public sealed record EmailMessage(string To, string Subject, string Html, string Text);

/// <summary>Sends email from hello@taperday.run (Brevo, see docs/email.md). Not configured means nothing is sent.</summary>
public interface IEmailSender
{
    bool Configured { get; }

    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}
