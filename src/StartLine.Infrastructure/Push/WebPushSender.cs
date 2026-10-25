using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Notifications;
using WebPushMessage = Lib.Net.Http.WebPush.PushMessage;
using WebPushSubscription = Lib.Net.Http.WebPush.PushSubscription;

namespace StartLine.Infrastructure.Push;

/// <summary>
/// Sends a push with the VAPID keys, encrypted for the device (aes128gcm), through the maintained
/// <c>Lib.Net.Http.WebPush</c>. The payload is the message as JSON, which <c>client/public/sw.js</c> shows.
/// </summary>
internal sealed class WebPushSender(HttpClient http, IOptions<PushOptions> options) : IPushSender
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<bool> SendAsync(PushAddress device, Application.Features.Notifications.PushMessage message, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(device);
        ArgumentNullException.ThrowIfNull(message);
        var settings = options.Value;
        using var vapid = new VapidAuthentication(settings.PublicKey, settings.PrivateKey) { Subject = settings.Subject };
        var client = new PushServiceClient(http) { DefaultAuthentication = vapid, AutoRetryAfter = false };
        var subscription = new WebPushSubscription { Endpoint = device.Endpoint };
        subscription.SetKey(PushEncryptionKeyName.P256DH, device.P256dh);
        subscription.SetKey(PushEncryptionKeyName.Auth, device.Auth);
        var push = new WebPushMessage(JsonSerializer.Serialize(message, Json))
        {
            // A newer message with the same topic replaces one still waiting for an offline phone.
            Topic = message.Tag,
            TimeToLive = (int)settings.TimeToLive.TotalSeconds,
            Urgency = PushMessageUrgency.Normal,
        };

        try
        {
            await client.RequestPushMessageDeliveryAsync(subscription, push, cancellationToken);
            return true;
        }
        catch (PushServiceClientException e) when (e.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return false;
        }
        catch (PushServiceClientException e)
        {
            // Not passed on as the inner exception: it carries the device's endpoint, which must never reach a log.
            throw new PushUnavailableException($"The push service answered {(int)e.StatusCode}.");
        }
        catch (HttpRequestException e)
        {
            throw new PushUnavailableException("The push service couldn't be reached.", e);
        }
        catch (TaskCanceledException e) when (!cancellationToken.IsCancellationRequested)
        {
            throw new PushUnavailableException("The push service didn't answer in time.", e);
        }
    }
}

/// <summary>
/// A device's push endpoint is a secret: with it and the keys, anyone can push to that device. These keep it out of
/// traces. The push client marks its requests, and the trace of a marked request records only the push service's host.
/// </summary>
public static class PushTraces
{
    internal static readonly HttpRequestOptionsKey<bool> Marker = new("StartLine.Push");

    /// <summary>For the HttpClient instrumentation's <c>EnrichWithHttpRequestMessage</c>.</summary>
    public static void Redact(Activity activity, HttpRequestMessage request)
    {
        ArgumentNullException.ThrowIfNull(activity);
        ArgumentNullException.ThrowIfNull(request);
        if (request.Options.TryGetValue(Marker, out var push) && push && request.RequestUri is { } uri)
        {
            activity.SetTag("url.full", $"{uri.Scheme}://{uri.Host}/{{device}}");
            activity.SetTag("url.path", "/{device}");
        }
    }
}

/// <summary>Marks every request of the push client, so <see cref="PushTraces.Redact"/> knows it.</summary>
internal sealed class MarkPushRequests : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        request.Options.Set(PushTraces.Marker, true);
        return base.SendAsync(request, cancellationToken);
    }
}

/// <summary>
/// Push endpoints and keys encrypted with Data Protection under their own purpose, with the same key ring as Strava tokens:
/// kept in SQL and, in Azure, wrapped by a Key Vault key. A copy of the database alone can't push to anyone.
/// </summary>
internal sealed class DataProtectionPushAddressProtector(IDataProtectionProvider provider) : IPushAddressProtector
{
    private readonly IDataProtector protector = provider.CreateProtector("StartLine.Push.Addresses.v1");

    public string Protect(string value) => protector.Protect(value);

    public string Unprotect(string protectedValue) => protector.Unprotect(protectedValue);
}
