using Microsoft.Extensions.Options;
using StartLine.Application.Features.Sync;

namespace StartLine.Infrastructure.Sync;

/// <summary>
/// The Strava API app's settings. Client id, secret, verify token and hook secret come from App Service settings
/// (<c>Strava__ClientSecret</c> and so on), never from the repo. Without a client id and secret the feature is off.
/// </summary>
public sealed class StravaOptions
{
    public const string Section = "Strava";

    public string ClientId { get; set; } = "";

    public string ClientSecret { get; set; } = "";

    /// <summary>The web app page Strava sends the runner back to, e.g. https://taperday.run/strava/callback.</summary>
    public Uri? RedirectUri { get; set; }

    public string VerifyToken { get; set; } = "";

    public string HookSecret { get; set; } = "";

    /// <summary>The id Strava returned when the push subscription was created. Until it's set, events are ignored.</summary>
    public long? SubscriptionId { get; set; }

    /// <summary>Configurable because Strava moves to api-v3.strava.com on 4 Jan 2027.</summary>
    public Uri ApiBaseUrl { get; set; } = new("https://www.strava.com/api/v3/");

    /// <summary>Authorize, token and deauthorize live here; deauthorize becomes /oauth/revoke on 1 Jun 2027.</summary>
    public Uri OAuthBaseUrl { get; set; } = new("https://www.strava.com/oauth/");

    public string DeauthorizePath { get; set; } = "deauthorize";

    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(20);
}

internal sealed class StravaSettings(IOptions<StravaOptions> options) : IStravaSettings
{
    private StravaOptions Value => options.Value;

    public bool IsEnabled => !string.IsNullOrWhiteSpace(Value.ClientId) && !string.IsNullOrWhiteSpace(Value.ClientSecret) && Value.RedirectUri is not null;

    public Uri RedirectUri => Value.RedirectUri ?? throw new InvalidOperationException("Strava:RedirectUri isn't set.");

    public long? SubscriptionId => Value.SubscriptionId;

    public string VerifyToken => Value.VerifyToken;

    public string HookSecret => Value.HookSecret;
}

internal sealed class StravaOptionsValidator : IValidateOptions<StravaOptions>
{
    public ValidateOptionsResult Validate(string? name, StravaOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrWhiteSpace(options.ClientId))
        {
            return ValidateOptionsResult.Success;
        }

        List<string> failures = [];
        if (string.IsNullOrWhiteSpace(options.ClientSecret))
        {
            failures.Add("Strava:ClientSecret is required when Strava:ClientId is set.");
        }

        if (options.RedirectUri is not { IsAbsoluteUri: true })
        {
            failures.Add("Strava:RedirectUri must be an absolute URL.");
        }

        // Short secrets are guessable: the hook path and verify token are the webhook's only protection against noise.
        if (options.HookSecret.Length < 24 || options.VerifyToken.Length < 24)
        {
            failures.Add("Strava:HookSecret and Strava:VerifyToken must be at least 24 characters.");
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }
}
