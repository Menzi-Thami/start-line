using StartLine.Domain.Common;

namespace StartLine.Domain.Sync;

public enum SyncProvider
{
    Strava,
}

public enum ConnectionStatus
{
    Active,

    /// <summary>The provider stopped accepting our tokens (revoked, or a refresh failed). The runner has to connect again.</summary>
    NeedsReconnect,
}

/// <summary>
/// Tokens as stored: already encrypted by the application layer. The domain never sees them in the clear and has no
/// way to read them.
/// </summary>
public sealed record ProtectedTokens(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt);

/// <summary>
/// A runner's link to a service that pushes their runs to Taperday. One per runner per provider, and one runner per
/// provider account. Deleted with the runner.
/// </summary>
public sealed class ProviderConnection
{
    public const int MaxScopesLength = 200;
    public const int MaxTokenLength = 2000;

    /// <summary>Strava's scope that includes runs the athlete keeps to "Only You".</summary>
    public const string StravaPrivateRunsScope = "activity:read_all";

    /// <summary>Opening the app asks the provider for missed runs at most this often.</summary>
    public static readonly TimeSpan CatchUpInterval = TimeSpan.FromMinutes(10);

    /// <summary>Access tokens are refreshed this long before they run out, so a slow request never uses a dead one.</summary>
    public static readonly TimeSpan RefreshMargin = TimeSpan.FromMinutes(5);

    private ProviderConnection()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public SyncProvider Provider { get; private set; }

    /// <summary>The runner's id at the provider (Strava's athlete id).</summary>
    public long ExternalAthleteId { get; private set; }

    /// <summary>What the runner granted, comma-separated as the provider reports it.</summary>
    public string Scopes { get; private set; } = "";

    public string AccessToken { get; private set; } = "";

    public string RefreshToken { get; private set; } = "";

    public DateTimeOffset AccessTokenExpiresAt { get; private set; }

    public ConnectionStatus Status { get; private set; }

    public DateTimeOffset ConnectedAt { get; private set; }

    /// <summary>When a run last arrived from the provider.</summary>
    public DateTimeOffset? LastSyncedAt { get; private set; }

    /// <summary>When the app last asked the provider for anything missed (opening the plan).</summary>
    public DateTimeOffset? LastCatchUpAt { get; private set; }

    public byte[] Version { get; private set; } = [];

    public bool IncludesPrivateRuns => Scopes.Split(',', StringSplitOptions.TrimEntries).Contains(StravaPrivateRunsScope, StringComparer.Ordinal);

    public static ProviderConnection Connect(Guid runnerId, SyncProvider provider, long externalAthleteId, string scopes, ProtectedTokens tokens, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(scopes);
        if (runnerId == Guid.Empty)
        {
            throw new DomainException("A connection belongs to a runner.");
        }

        if (externalAthleteId <= 0)
        {
            throw new DomainException("A connection needs the runner's id at the provider.");
        }

        if (scopes.Length > MaxScopesLength)
        {
            throw new DomainException("That's more access than Taperday asked for.");
        }

        var connection = new ProviderConnection
        {
            Id = Guid.NewGuid(),
            RunnerId = runnerId,
            Provider = provider,
            ExternalAthleteId = externalAthleteId,
            Scopes = scopes,
            ConnectedAt = now,
        };
        connection.UpdateTokens(tokens);
        return connection;
    }

    /// <summary>New tokens after a refresh. The provider may rotate the refresh token, so both are always replaced.</summary>
    public void UpdateTokens(ProtectedTokens tokens)
    {
        ArgumentNullException.ThrowIfNull(tokens);
        if (string.IsNullOrEmpty(tokens.AccessToken) || string.IsNullOrEmpty(tokens.RefreshToken))
        {
            throw new DomainException("A connection needs both tokens.");
        }

        if (tokens.AccessToken.Length > MaxTokenLength || tokens.RefreshToken.Length > MaxTokenLength)
        {
            throw new DomainException("Those tokens are longer than any provider issues.");
        }

        AccessToken = tokens.AccessToken;
        RefreshToken = tokens.RefreshToken;
        AccessTokenExpiresAt = tokens.AccessTokenExpiresAt;
        Status = ConnectionStatus.Active;
    }

    public bool AccessTokenNeedsRefresh(DateTimeOffset now) => AccessTokenExpiresAt - RefreshMargin <= now;

    public void RequireReconnect() => Status = ConnectionStatus.NeedsReconnect;

    public void MarkSynced(DateTimeOffset now) => LastSyncedAt = now;

    /// <summary>True (and remembered) when it's been long enough since the last catch-up to ask the provider again.</summary>
    public bool TryStartCatchUp(DateTimeOffset now)
    {
        if (Status != ConnectionStatus.Active || (LastCatchUpAt is { } last && now - last < CatchUpInterval))
        {
            return false;
        }

        LastCatchUpAt = now;
        return true;
    }
}
