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

    /// <summary>
    /// A signed-up runner who has accepted the current privacy notice. For anything that adds data (saving a plan,
    /// uploading, connecting Strava); reading, exporting, disconnecting and deleting never wait on the notice.
    /// </summary>
    public async Task<Runner> RequireConsentedAsync(CancellationToken cancellationToken)
    {
        var runner = await RequireAsync(cancellationToken);
        return runner.HasAccepted(PrivacyNotice.CurrentVersion)
            ? runner
            : throw new ForbiddenException("privacy_notice_outdated", "Taperday's privacy notice has changed. Read and accept it to carry on.");
    }
}
