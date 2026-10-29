using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Domain.Activities;
using StartLine.Domain.Notifications;

namespace StartLine.Application.Features.Notifications;

internal sealed partial class RunCelebrator(IApplicationDbContext db, IPushSettings settings, IPushSender sender,
    IPushAddressProtector protector, TimeProvider time, ILogger<RunCelebrator> logger)
{
    public static string OpensAt(Guid runId) => $"/?view=runs&run={runId:D}";
    public async Task OfferAsync(Activity run, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(run);
        var age = time.GetUtcNow() - run.StartedAt;
        if (!settings.IsEnabled || run.Source != ActivitySource.Strava || run.Celebrated || age < TimeSpan.Zero || age > TickPrompts.MaxRunAge) return;
        var devices = await db.PushSubscriptions.Where(s => s.RunnerId == run.RunnerId).ToListAsync(cancellationToken);
        if (devices.Count == 0) return;
        // Atomic claim before delivery: repeats and concurrent sync workers cannot notify twice.
        if (await db.Activities.Where(a => a.Id == run.Id && !a.Celebrated).ExecuteUpdateAsync(s => s.SetProperty(a => a.Celebrated, true), cancellationToken) == 0) return;
        var marker = db.Activities.Entry(run).Property(a => a.Celebrated);
        marker.CurrentValue = true;
        marker.OriginalValue = true;
        var runner = await db.Runners.AsNoTracking().SingleAsync(r => r.Id == run.RunnerId, cancellationToken);
        var body = settings.IncludeRunData ? $"Your {Reminders.Distance(run.DistanceKm, runner.Units)} run has arrived from Strava." : "Your run has arrived from Strava.";
        var message = new PushMessage("Nice work — run finished!", $"{body} Open it to review your run and log how it fits your plan.", OpensAt(run.Id), $"run-{run.Id:D}");
        foreach (var device in devices)
        {
            var address = new PushAddress(protector.Unprotect(device.Endpoint), protector.Unprotect(device.P256dh), protector.Unprotect(device.Auth));
            try { if (!await sender.SendAsync(address, message, cancellationToken)) db.PushSubscriptions.Remove(device); }
            catch (PushUnavailableException e) { LogSendFailed(logger, device.Id, e); }
        }
        await db.SaveChangesAsync(cancellationToken);
    }
    [LoggerMessage(Level = LogLevel.Warning, Message = "Run notification to device {DeviceId} not delivered; the push service is unavailable")]
    private static partial void LogSendFailed(ILogger logger, Guid deviceId, Exception exception);
}
