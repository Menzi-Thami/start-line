using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;

namespace StartLine.Infrastructure.Email;

/// <summary>
/// An email's unsubscribe key: the runner's id and the list, encrypted and authenticated with Data Protection under its
/// own purpose (the same key ring as Strava tokens and "Tick it" keys, so a key from one can never be read as another).
/// Unlike a "Tick it" key it carries no expiry: the link has to keep working in an email read months later. Data
/// Protection keeps retired keys for reading, so a key ring rotation doesn't break old links either. The version names
/// the list: "u1" keys, issued before the weekly recap existed, stop update emails, as they always did.
/// </summary>
internal sealed class DataProtectionUnsubscribeTokens(IDataProtectionProvider provider) : IUnsubscribeTokens
{
    private const string Updates = "u1";
    private const string Weekly = "w1";

    private readonly IDataProtector protector = provider.CreateProtector("StartLine.Email.Unsubscribe.v1");

    public string Issue(Guid runnerId, EmailList list = EmailList.Updates) =>
        protector.Protect($"{(list == EmailList.Weekly ? Weekly : Updates)}|{runnerId:N}");

    public UnsubscribeKey Read(string token)
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
        EmailList? list = parts.Length == 2 ? parts[0] switch { Updates => EmailList.Updates, Weekly => EmailList.Weekly, _ => null } : null;
        return list is { } known && Guid.TryParseExact(parts[1], "N", out var runnerId)
            ? new UnsubscribeKey(runnerId, known)
            : throw Invalid();
    }

    private static ValidationException Invalid() =>
        new(new Dictionary<string, string[]> { ["token"] = ["That unsubscribe link isn't complete. Turn these emails off in Account instead."] });
}
