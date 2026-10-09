using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Account;

/// <summary>Finds the signed-in runner. Every account and saved-plan operation starts here.</summary>
internal sealed class CurrentRunner(IApplicationDbContext db, ICurrentUser user)
{
    public string Subject => user.Subject ?? throw new ForbiddenException("not_signed_in", "Sign in to do this.");

    public Task<Runner?> FindAsync(CancellationToken cancellationToken)
    {
        var subject = Subject;
        return db.Runners.SingleOrDefaultAsync(r => r.IdentitySubject == subject, cancellationToken);
    }

    public async Task<Runner> RequireAsync(CancellationToken cancellationToken) =>
        await FindAsync(cancellationToken)
        ?? throw new ForbiddenException("registration_required", "Finish signing up before saving plans.");
}
