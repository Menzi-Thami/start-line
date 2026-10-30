using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;

namespace StartLine.Infrastructure.Email;

/// <summary>
/// An email's unsubscribe key: the runner's id, encrypted and authenticated with Data Protection under its own purpose
/// (the same key ring as Strava tokens and "Tick it" keys, so a key from one can never be read as another). Unlike a
/// "Tick it" key it carries no expiry: the link has to keep working in an email read months later. Data Protection keeps
/// retired keys for reading, so a key ring rotation doesn't break old links either.
/// </summary>
internal sealed class DataProtectionUnsubscribeTokens(IDataProtectionProvider provider) : IUnsubscribeTokens
{
    private const string Version = "u1";

    private readonly IDataProtector protector = provider.CreateProtector("StartLine.Email.Unsubscribe.v1");

    public string Issue(Guid runnerId) => protector.Protect($"{Version}|{runnerId:N}");

    public Guid Read(string token)
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
        return parts.Length == 2 && parts[0] == Version && Guid.TryParseExact(parts[1], "N", out var runnerId)
            ? runnerId
            : throw Invalid();
    }

    private static ValidationException Invalid() =>
        new(new Dictionary<string, string[]> { ["token"] = ["That unsubscribe link isn't complete. Turn update emails off in Account instead."] });
}
