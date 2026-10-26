using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.CheckIns;

/// <summary>The one session a tick from a notification may tick, and whose it is.</summary>
public sealed record TickClaim(Guid RunnerId, Guid PlanId, DateOnly Date, SessionType SessionType)
{
    /// <summary>How long a token works: long enough to answer a push that waited for a phone to come on, no longer.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(3);
}

/// <summary>
/// The key behind a notification's "Tick it" button. A service worker can't sign in, so the push carries this instead:
/// encrypted and authenticated, good for one session of one runner's plan and only for <see cref="TickClaim.Lifetime"/>.
/// </summary>
public interface ITickTokens
{
    string Issue(TickClaim claim);

    /// <summary>The claim, or <see cref="ValidationException"/> for a token that's been tampered with or has expired.</summary>
    TickClaim Read(string token);
}

/// <summary>
/// "Tick it", tapped on a notification: the runner says they ran that session, nothing more. It's their own check-in, so
/// it's kept; it never overwrites one they've already made. A tap is the runner's own act; Taperday never ticks for them.
/// </summary>
public sealed record TickFromNotificationCommand(string Token) : IRequest<bool>;

internal sealed class TickFromNotificationValidator : AbstractValidator<TickFromNotificationCommand>
{
    public const int MaxTokenLength = 1000;

    public TickFromNotificationValidator()
    {
        RuleFor(c => c.Token).NotEmpty().MaximumLength(MaxTokenLength);
    }
}

internal sealed class TickFromNotificationHandler(IApplicationDbContext db, ITickTokens tokens, PlanBuilder builder)
    : IRequestHandler<TickFromNotificationCommand, bool>
{
    public async Task<bool> Handle(TickFromNotificationCommand request, CancellationToken cancellationToken)
    {
        var claim = tokens.Read(request.Token);
        var plan = await db.SavedPlans.AsNoTracking()
            .SingleOrDefaultAsync(p => p.Id == claim.PlanId && p.RunnerId == claim.RunnerId, cancellationToken)
            ?? throw new NotFoundException("Saved plan", claim.PlanId.ToString());
        if (plan.Status != SavedPlanStatus.Active)
        {
            throw new ConflictException("plan_archived", "This is a past plan. Make it your plan again to check in on its runs.");
        }

        await PlanSessions.RequireAsync(db, builder, plan, claim.Date, claim.SessionType, cancellationToken);
        if (await AlreadyCheckedInAsync(claim, cancellationToken))
        {
            return true;
        }

        db.SessionCheckIns.Add(SessionCheckIn.Create(plan.Id, claim.Date, claim.SessionType, new CheckInAnswers(CheckInStatus.Done, Effort: null)));
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Ticked twice at once (the app and the notification): one check-in either way. Anything else is a real failure.
            if (!await AlreadyCheckedInAsync(claim, cancellationToken))
            {
                throw;
            }
        }

        return true;
    }

    private Task<bool> AlreadyCheckedInAsync(TickClaim claim, CancellationToken cancellationToken) =>
        db.SessionCheckIns.AsNoTracking().AnyAsync(
            c => c.SavedPlanId == claim.PlanId && c.Date == claim.Date && c.SessionType == claim.SessionType, cancellationToken);
}
