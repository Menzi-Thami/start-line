using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Features.Account;

namespace StartLine.Application.Features.Insights;

/// <summary>
/// An update email for every runner who'd want it: everyone with an email address who hasn't turned news and updates off,
/// each copy with that runner's own unsubscribe links. It only composes; nothing here sends, and nothing calls it on a
/// timer. Sending to everyone is a deliberate act, and the way to trigger it is still to be built (docs/email.md).
/// </summary>
public sealed class UpdateBroadcast(IApplicationDbContext db, IUnsubscribeTokens tokens, IEmailSettings settings)
{
    /// <summary>One email per runner, from <paramref name="compose"/> given their address and unsubscribe links.</summary>
    public async Task<IReadOnlyList<EmailMessage>> ComposeAsync(Func<string, UnsubscribeLinks, EmailMessage> compose, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(compose);
        var recipients = await db.Runners.AsNoTracking()
            .Where(r => r.Email != null && r.UpdateEmailsOffAt == null)
            .OrderBy(r => r.CreatedAt)
            .Select(r => new { r.Id, Email = r.Email! })
            .ToListAsync(cancellationToken);
        return [.. recipients.Select(r => compose(r.Email, UnsubscribeLinks.For(tokens.Issue(r.Id), settings.ApiBaseUrl)))];
    }

    /// <summary>Race Plan v3, for every runner who gets updates.</summary>
    public Task<IReadOnlyList<EmailMessage>> RacePlanV3Async(CancellationToken cancellationToken) =>
        ComposeAsync((to, unsubscribe) => UpdateEmails.RacePlanV3(to, unsubscribe: unsubscribe), cancellationToken);
}
