using System.Buffers.Text;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Notifications;

namespace StartLine.Infrastructure.Push;

/// <summary>
/// Web Push settings. The VAPID key pair comes from App Service settings (<c>Push__PublicKey</c>, <c>Push__PrivateKey</c>,
/// <c>Push__Subject</c>), never from the repo; <c>docs/deploy.md</c> says how to make one. Without the keys, reminders are off.
/// </summary>
public sealed class PushOptions
{
    public const string Section = "Push";

    /// <summary>The VAPID public key: an uncompressed P-256 point, base64url (65 bytes).</summary>
    public string PublicKey { get; set; } = "";

    /// <summary>The VAPID private key, base64url (32 bytes). A secret.</summary>
    public string PrivateKey { get; set; } = "";

    /// <summary>Who push services can contact about Taperday's pushes: a mailto: or https: address.</summary>
    public string Subject { get; set; } = "";

    /// <summary>
    /// The push services a device's endpoint may be on: a host here or under it. Chrome and Android (Google), Safari and
    /// iPhone (Apple), Firefox (Mozilla), Edge (Microsoft). Anything else is refused, so the API only ever posts to these.
    /// </summary>
    public IReadOnlyList<string> AllowedHosts { get; set; } =
        ["fcm.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];

    /// <summary>How long a push service keeps a reminder for a phone that's offline. Past it, the day's reminder is stale.</summary>
    public TimeSpan TimeToLive { get; set; } = TimeSpan.FromHours(8);

    /// <summary>
    /// Let a reminder carry what comes from the runner's runs (the coach's call, coached distances and paces, last week's
    /// distance). Off until Strava confirms that pushing a runner their own synced data to their own device is allowed
    /// (<c>docs/strava-sync.md</c>): without it, reminders are built from the plan as written and check-ins only.
    /// </summary>
    public bool IncludeRunData { get; set; }

    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(20);
}

internal sealed class PushSettings(IOptions<PushOptions> options) : IPushSettings
{
    private PushOptions Value => options.Value;

    public bool IsEnabled => !string.IsNullOrWhiteSpace(Value.PublicKey) && !string.IsNullOrWhiteSpace(Value.PrivateKey);

    public string? PublicKey => IsEnabled ? Value.PublicKey : null;

    public bool IncludeRunData => Value.IncludeRunData;

    public bool Accepts(Uri endpoint)
    {
        ArgumentNullException.ThrowIfNull(endpoint);
        var host = endpoint.IdnHost;
        return Value.AllowedHosts.Any(allowed =>
            string.Equals(host, allowed, StringComparison.OrdinalIgnoreCase)
            || host.EndsWith("." + allowed, StringComparison.OrdinalIgnoreCase));
    }
}

internal sealed class PushOptionsValidator : IValidateOptions<PushOptions>
{
    public ValidateOptionsResult Validate(string? name, PushOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrWhiteSpace(options.PublicKey) && string.IsNullOrWhiteSpace(options.PrivateKey))
        {
            return ValidateOptionsResult.Success;
        }

        List<string> failures = [];
        if (!(Base64Url.IsValid(options.PublicKey, out var publicBytes) && publicBytes == 65))
        {
            failures.Add("Push:PublicKey must be a base64url VAPID public key (65 bytes).");
        }

        if (!(Base64Url.IsValid(options.PrivateKey, out var privateBytes) && privateBytes == 32))
        {
            failures.Add("Push:PrivateKey must be a base64url VAPID private key (32 bytes).");
        }

        if (!options.Subject.StartsWith("mailto:", StringComparison.Ordinal) && !options.Subject.StartsWith("https://", StringComparison.Ordinal))
        {
            failures.Add("Push:Subject must be a mailto: or https: address.");
        }

        if (options.AllowedHosts.Count == 0)
        {
            failures.Add("Push:AllowedHosts must name at least one push service.");
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }
}
