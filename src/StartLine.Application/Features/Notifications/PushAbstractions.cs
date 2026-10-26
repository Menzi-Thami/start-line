namespace StartLine.Application.Features.Notifications;

/// <summary>Web Push settings the application needs. The VAPID keys live in configuration, never in code or the repo.</summary>
public interface IPushSettings
{
    /// <summary>False until the VAPID keys are configured: reminders then stay hidden and nothing is ever sent.</summary>
    bool IsEnabled { get; }

    /// <summary>The VAPID public key, base64url, which the browser needs to subscribe. Null while push is off.</summary>
    string? PublicKey { get; }

    /// <summary>
    /// Whether <paramref name="endpoint"/> is one of the browsers' push services. Taperday posts to whatever endpoint a
    /// device gives it, so only those hosts are accepted: an endpoint can never point the API at anywhere else.
    /// </summary>
    bool Accepts(Uri endpoint);

    /// <summary>
    /// Whether a reminder may carry what comes from the runner's runs: the coach's call, the plan as the coach has it,
    /// and the distance they ran. Off by default, so no run data (Strava's or any other) is pushed until it's turned on.
    /// </summary>
    bool IncludeRunData { get; }
}

/// <summary>Where one device's pushes go, in the clear: only ever in memory, on the way to the push service.</summary>
public sealed record PushAddress(string Endpoint, string P256dh, string Auth);

/// <summary>
/// What the service worker shows: a title, a line, and the page a tap opens. <c>Tag</c> lets a repeat replace, not stack.
/// <c>Tick</c>, on a "ran it?" prompt only, is the key for its "Tick it" button (<see cref="CheckIns.ITickTokens"/>), where
/// the browser shows buttons on a notification.
/// </summary>
public sealed record PushMessage(string Title, string Body, string Url, string Tag, string? Tick = null);

/// <summary>
/// The browsers' push services (Google, Apple, Mozilla, Microsoft), as much as Taperday uses. Implemented with a Web Push
/// library in Infrastructure; tests use a fake, so no test ever sends a real push.
/// </summary>
public interface IPushSender
{
    /// <summary>
    /// Delivers one message, encrypted for the device. False when the push service says the device has gone (unsubscribed
    /// or expired), so its subscription should go too. Anything else that stops it throws <see cref="PushUnavailableException"/>.
    /// </summary>
    Task<bool> SendAsync(PushAddress device, PushMessage message, CancellationToken cancellationToken);
}

/// <summary>A push endpoint and keys, encrypted at rest under their own purpose, as Strava tokens are.</summary>
public interface IPushAddressProtector
{
    string Protect(string value);

    string Unprotect(string protectedValue);
}

/// <summary>Sends the reminders that are due. The worker in Infrastructure calls it, and sleeps until the time it returns.</summary>
public interface IReminderRunner
{
    /// <summary>Sends what's due and returns when the next reminder is due; null when none is coming.</summary>
    Task<DateTimeOffset?> RunDueAsync(CancellationToken cancellationToken);
}

#pragma warning disable CA1032 // Carries required data.

/// <summary>The push service couldn't take a message right now (down, throttled, or refused it for a reason other than a gone device).</summary>
public sealed class PushUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
#pragma warning restore CA1032
