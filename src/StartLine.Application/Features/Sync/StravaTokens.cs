using StartLine.Application.Common;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Sync;

/// <summary>Hands out a working access token for a connection, refreshing (and re-encrypting) it when it's about to run out.</summary>
internal sealed class StravaTokens(IApplicationDbContext db, IStravaApi strava, ITokenProtector protector, TimeProvider time)
{
    public ProtectedTokens Protect(StravaTokenGrant grant)
    {
        ArgumentNullException.ThrowIfNull(grant);
        return new ProtectedTokens(protector.Protect(grant.AccessToken), protector.Protect(grant.RefreshToken), grant.ExpiresAt);
    }

    public async Task<string> AccessTokenAsync(ProviderConnection connection, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(connection);
        if (connection.Status != ConnectionStatus.Active)
        {
            throw new StravaUnauthorizedException("This runner needs to connect Strava again.");
        }

        if (connection.AccessTokenNeedsRefresh(time.GetUtcNow()))
        {
            try
            {
                var grant = await strava.RefreshAsync(protector.Unprotect(connection.RefreshToken), cancellationToken);
                connection.UpdateTokens(Protect(grant));
            }
            catch (StravaUnauthorizedException)
            {
                // The refresh token is dead (revoked at Strava). Remember that, then let the caller see the failure.
                connection.RequireReconnect();
                await db.SaveChangesAsync(cancellationToken);
                throw;
            }

            // Saved straight away: Strava may have rotated the refresh token, and the old one stops working.
            await db.SaveChangesAsync(cancellationToken);
        }

        return protector.Unprotect(connection.AccessToken);
    }
}
