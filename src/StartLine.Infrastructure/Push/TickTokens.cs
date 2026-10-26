using System.Globalization;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.CheckIns;
using StartLine.Domain.Plans;

namespace StartLine.Infrastructure.Push;

/// <summary>
/// A notification's "Tick it" key: the runner, plan and session and an expiry, encrypted and authenticated with Data
/// Protection under its own purpose (the same key ring as Strava tokens and push addresses). The expiry is checked against
/// the app's <see cref="TimeProvider"/>, as the Strava OAuth state is.
/// </summary>
internal sealed class DataProtectionTickTokens(IDataProtectionProvider provider, TimeProvider time) : ITickTokens
{
    private readonly IDataProtector protector = provider.CreateProtector("StartLine.Push.Ticks.v1");

    public string Issue(TickClaim claim)
    {
        ArgumentNullException.ThrowIfNull(claim);
        var expires = (time.GetUtcNow() + TickClaim.Lifetime).ToUnixTimeSeconds();
        return protector.Protect(string.Create(
            CultureInfo.InvariantCulture, $"{claim.RunnerId:N}|{claim.PlanId:N}|{claim.Date:yyyy-MM-dd}|{claim.SessionType}|{expires}"));
    }

    public TickClaim Read(string token)
    {
        string payload;
        try
        {
            payload = protector.Unprotect(token);
        }
        catch (CryptographicException)
        {
            throw Invalid();
        }

        var parts = payload.Split('|');
        if (parts.Length != 5
            || !Guid.TryParseExact(parts[0], "N", out var runnerId)
            || !Guid.TryParseExact(parts[1], "N", out var planId)
            || !DateOnly.TryParseExact(parts[2], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            || !Enum.TryParse<SessionType>(parts[3], out var type)
            || !long.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out var expires)
            || DateTimeOffset.FromUnixTimeSeconds(expires) < time.GetUtcNow())
        {
            throw Invalid();
        }

        return new TickClaim(runnerId, planId, date, type);
    }

    private static ValidationException Invalid() =>
        new(new Dictionary<string, string[]> { ["token"] = ["That notification has expired. Open Taperday to tick the run."] });
}
