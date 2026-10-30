using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Domain.Activities;
using StartLine.Domain.Notifications;

namespace StartLine.Application.Features.Notifications;

internal sealed class RunCelebrator(IApplicationDbContext db, IPushSettings settings, NotificationDeliverer deliverer, TimeProvider time)
{
    public static string OpensAt(Guid runId) => $"/?view=runs&run={runId:D}";

    public async Task OfferAsync(Activity run, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(run);
        var now = time.GetUtcNow();
        var age = now - run.StartedAt;
        if (!settings.IsEnabled || run.Source != ActivitySource.Strava || run.Celebrated || age < TimeSpan.Zero || age > TickPrompts.MaxRunAge) return;
        var devices = await db.PushSubscriptions.Where(s => s.RunnerId == run.RunnerId && s.RunCongratulations).ToListAsync(cancellationToken);
        if (devices.Count == 0) return;
        if (await db.Activities.Where(a => a.Id == run.Id && !a.Celebrated).ExecuteUpdateAsync(s => s.SetProperty(a => a.Celebrated, true), cancellationToken) == 0) return;
        var marker = db.Activities.Entry(run).Property(a => a.Celebrated);
        marker.CurrentValue = true;
        marker.OriginalValue = true;
        foreach (var device in devices)
        {
            await deliverer.QueueAsync(device, NotificationKind.RunCongratulations, run.Id, run.Id.ToString("N"), now,
                run.StartedAt + TickPrompts.MaxRunAge, cancellationToken);
            await deliverer.FlushAsync(cancellationToken, device.Id);
        }
    }
}
