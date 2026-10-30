using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Insights;

/// <summary>Who may see the insights page: Taperday's maker, by the email they sign in with (Insights:AdminEmails).</summary>
public interface IInsightsAccess
{
    bool IsAdmin(string? email);
}

/// <summary>"Send feedback" from the app: saved for the maker to read on the insights page.</summary>
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
/// this week, and the latest feedback. No names or emails.
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

public sealed record GetInsightsQuery : IRequest<InsightsDto>;

internal sealed class GetInsightsHandler(IApplicationDbContext db, CurrentRunner current, IInsightsAccess access, TimeProvider time)
    : IRequestHandler<GetInsightsQuery, InsightsDto>
{
    public async Task<InsightsDto> Handle(GetInsightsQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        if (!access.IsAdmin(runner.Email))
        {
            throw new ForbiddenException("not_admin", "Insights are for Taperday's maker only.");
        }

        var now = time.GetUtcNow();
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
            await db.Feedback.AsNoTracking().OrderByDescending(f => f.CreatedAt).Take(30)
                .Select(f => new FeedbackNoteDto(f.Message, f.Page, f.CreatedAt)).ToListAsync(cancellationToken));
    }
}
