using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;

namespace StartLine.Application.Features.Account;

/// <summary>Which emails an unsubscribe link stops. Each list has its own link, so stopping one never stops the other.</summary>
public enum EmailList
{
    /// <summary>News and update emails about Taperday itself.</summary>
    Updates,

    /// <summary>The runner's weekly recap of their running.</summary>
    Weekly,
}

/// <summary>What an unsubscribe key says: whose it is, and which emails it stops.</summary>
public sealed record UnsubscribeKey(Guid RunnerId, EmailList List);

/// <summary>
/// The key in an email's unsubscribe link. Someone reading their email isn't signed in to Taperday, and a mail app's
/// one-click unsubscribe never is, so the link carries this instead: the runner and the list, encrypted and
/// authenticated. It never expires, because an unsubscribe link in an old email must still work; all it can ever do is
/// stop the one list it was issued for.
/// </summary>
public interface IUnsubscribeTokens
{
    string Issue(Guid runnerId, EmailList list = EmailList.Updates);

    /// <summary>The key, or <see cref="Common.Exceptions.ValidationException"/> for a token that's been tampered with.</summary>
    UnsubscribeKey Read(string token);
}

/// <summary>
/// "Unsubscribe", from an email: stops that runner's emails on the key's list. Doing it again changes nothing, so a link
/// tapped twice, or a mail app's one-click after the link, is fine. It never turns anything on.
/// </summary>
public sealed record UnsubscribeCommand(string Token) : IRequest<bool>;

internal sealed class UnsubscribeValidator : AbstractValidator<UnsubscribeCommand>
{
    public const int MaxTokenLength = 1000;

    public UnsubscribeValidator()
    {
        RuleFor(c => c.Token).NotEmpty().MaximumLength(MaxTokenLength);
    }
}

internal sealed class UnsubscribeHandler(IApplicationDbContext db, IUnsubscribeTokens tokens, TimeProvider time)
    : IRequestHandler<UnsubscribeCommand, bool>
{
    public async Task<bool> Handle(UnsubscribeCommand request, CancellationToken cancellationToken)
    {
        var key = tokens.Read(request.Token);

        // A good key for an account since deleted: there's no one left to email, so the answer is the same as for anyone
        // else. Saying otherwise would only tell a stranger holding the link that the account has gone.
        var runner = await db.Runners.SingleOrDefaultAsync(r => r.Id == key.RunnerId, cancellationToken);
        if (runner is null)
        {
            return true;
        }

        switch (key.List)
        {
            case EmailList.Weekly when runner.WeeklyEmails:
                runner.TurnOffWeeklyEmails();
                break;
            case EmailList.Updates when runner.UpdateEmails:
                runner.TurnOffUpdateEmails(time.GetUtcNow());
                break;
            default:
                return true;
        }

        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
