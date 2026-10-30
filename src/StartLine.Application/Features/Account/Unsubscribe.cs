using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;

namespace StartLine.Application.Features.Account;

/// <summary>
/// The key in an email's unsubscribe link. Someone reading their email isn't signed in to Taperday, and a mail app's
/// one-click unsubscribe never is, so the link carries this instead: the runner, encrypted and authenticated. It never
/// expires, because an unsubscribe link in an old email must still work; all it can ever do is stop update emails.
/// </summary>
public interface IUnsubscribeTokens
{
    string Issue(Guid runnerId);

    /// <summary>The runner, or <see cref="Common.Exceptions.ValidationException"/> for a token that's been tampered with.</summary>
    Guid Read(string token);
}

/// <summary>
/// "Unsubscribe", from an email: stops that runner's news and update emails. Doing it again changes nothing, so a link
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
        var runnerId = tokens.Read(request.Token);

        // A good key for an account since deleted: there's no one left to email, so the answer is the same as for anyone
        // else. Saying otherwise would only tell a stranger holding the link that the account has gone.
        var runner = await db.Runners.SingleOrDefaultAsync(r => r.Id == runnerId, cancellationToken);
        if (runner is null || !runner.UpdateEmails)
        {
            return true;
        }

        runner.TurnOffUpdateEmails(time.GetUtcNow());
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
