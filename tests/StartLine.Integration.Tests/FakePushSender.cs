using System.Buffers.Text;
using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StartLine.Application.Features.Notifications;
using StartLine.Infrastructure.Push;

namespace StartLine.Integration.Tests;

/// <summary>Stands in for the browsers' push services: records what would have been pushed, and to which endpoint.</summary>
public sealed class FakePushSender : IPushSender
{
    public ConcurrentQueue<(PushAddress Device, PushMessage Message)> Sent { get; } = new();

    /// <summary>Endpoints the push service says have gone (the runner unsubscribed in the browser, or it expired).</summary>
    public ConcurrentDictionary<string, bool> Gone { get; } = new(StringComparer.Ordinal);

    public IReadOnlyList<PushMessage> To(string endpoint) => [.. Sent.Where(s => s.Device.Endpoint == endpoint).Select(s => s.Message)];

    public Task<bool> SendAsync(PushAddress device, PushMessage message, CancellationToken cancellationToken)
    {
        if (Gone.ContainsKey(device.Endpoint))
        {
            return Task.FromResult(false);
        }

        Sent.Enqueue((device, message));
        return Task.FromResult(true);
    }
}

/// <summary>The API with reminders switched on (made-up VAPID keys) and a fake push service. The tests drive the sender.</summary>
public sealed class RemindersFactory : StartLineApiFactory
{
    public FakePushSender Push { get; } = new();

    /// <summary>Let reminders carry run data (the coach's call, distance run): <c>Push:IncludeRunData</c>.</summary>
    public bool IncludeRunData { get; init; }

    /// <summary>A browser's subscription, as <c>pushManager.subscribe</c> gives it, on Google's push service.</summary>
    public static object Subscription(string endpoint, string remindAt = "07:00:00", bool weekAhead = false) => new
    {
        endpoint,
        p256dh = Base64Url.EncodeToString([0x04, .. new byte[64]]),
        auth = Base64Url.EncodeToString(new byte[16]),
        remindAt,
        weekAhead,
    };

    public static string NewEndpoint() => $"https://fcm.googleapis.com/fcm/send/{Guid.NewGuid():N}";

    protected override IDictionary<string, string?> Settings => new Dictionary<string, string?>
    {
        ["Push:PublicKey"] = Base64Url.EncodeToString([0x04, .. Enumerable.Repeat((byte)7, 64)]),
        ["Push:PrivateKey"] = Base64Url.EncodeToString([.. Enumerable.Repeat((byte)9, 32)]),
        ["Push:Subject"] = "mailto:reminders@taperday.test",
        ["Push:IncludeRunData"] = IncludeRunData ? "true" : "false",
    };

    protected override void ConfigureServices(IServiceCollection services)
    {
        services.RemoveAll<IPushSender>();
        services.AddSingleton<IPushSender>(Push);
        // The tests send step by step, so the background worker is left out.
        var worker = services.Single(d => d.ServiceType == typeof(Microsoft.Extensions.Hosting.IHostedService) && d.ImplementationType == typeof(ReminderWorker));
        services.Remove(worker);
    }
}
