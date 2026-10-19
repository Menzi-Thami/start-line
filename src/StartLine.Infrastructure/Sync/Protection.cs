using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Sync;

namespace StartLine.Infrastructure.Sync;

/// <summary>
/// Strava tokens encrypted with ASP.NET Core Data Protection under their own purpose. The key ring is kept in SQL and,
/// in Azure, wrapped by a Key Vault key: a copy of the database alone can't decrypt a token.
/// </summary>
internal sealed class DataProtectionTokenProtector(IDataProtectionProvider provider) : ITokenProtector
{
    private readonly IDataProtector protector = provider.CreateProtector("StartLine.Sync.Tokens.v1");

    public string Protect(string token) => protector.Protect(token);

    public string Unprotect(string protectedToken) => protector.Unprotect(protectedToken);
}

/// <summary>
/// The OAuth state: the runner's id and an expiry, encrypted and authenticated, with a random nonce so no two match.
/// The expiry is checked against the app's <see cref="TimeProvider"/> rather than Data Protection's own clock.
/// </summary>
internal sealed class DataProtectionConnectState(IDataProtectionProvider provider, TimeProvider time) : IConnectState
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    private readonly IDataProtector protector = provider.CreateProtector("StartLine.Sync.ConnectState.v1");

    public string Issue(Guid runnerId)
    {
        var expires = (time.GetUtcNow() + Lifetime).ToUnixTimeSeconds();
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(8));
        return protector.Protect(string.Create(CultureInfo.InvariantCulture, $"{runnerId:N}|{expires}|{nonce}"));
    }

    public Guid Read(string state)
    {
        string payload;
        try
        {
            payload = protector.Unprotect(state);
        }
        catch (CryptographicException)
        {
            throw Invalid();
        }

        var parts = payload.Split('|');
        if (parts.Length != 3
            || !Guid.TryParseExact(parts[0], "N", out var runnerId)
            || !long.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var expires)
            || DateTimeOffset.FromUnixTimeSeconds(expires) < time.GetUtcNow())
        {
            throw Invalid();
        }

        return runnerId;
    }

    private static ValidationException Invalid() =>
        new(new Dictionary<string, string[]> { ["state"] = ["That Strava link has expired. Connect again from your account page."] });
}

/// <summary>Wakes the sync worker. Several wakes before it runs count as one.</summary>
internal sealed class SyncSignal : ISyncSignal, IDisposable
{
    private readonly SemaphoreSlim signal = new(0, 1);

    public void Wake()
    {
        try
        {
            signal.Release();
        }
        catch (SemaphoreFullException)
        {
            // Already woken and not yet picked up: nothing more to do.
        }
    }

    /// <summary>Waits for a wake or the timeout, whichever comes first. The timeout runs on <paramref name="time"/>.</summary>
    public async Task WaitAsync(TimeSpan timeout, TimeProvider time, CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var woken = signal.WaitAsync(linked.Token);
        var timer = Task.Delay(timeout, time, linked.Token);
        await Task.WhenAny(woken, timer);
        await linked.CancelAsync();
        cancellationToken.ThrowIfCancellationRequested();
    }

    public void Dispose() => signal.Dispose();
}
