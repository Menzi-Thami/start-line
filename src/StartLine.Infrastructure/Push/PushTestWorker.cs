using System.Globalization;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StartLine.Application.Common;
using StartLine.Application.Features.Notifications;

namespace StartLine.Infrastructure.Push;

/// <summary>Operator-configured, finite diagnostic: two pushes one hour apart to one runner's opted-in devices.</summary>
internal sealed class PushTestOptions
{
    public string TargetEmail { get; set; } = "";

    public DateTimeOffset? FirstAt { get; set; }

    public bool IsEnabled => !string.IsNullOrWhiteSpace(TargetEmail) && FirstAt.HasValue;
}

internal sealed class PushTestOptionsValidator : IValidateOptions<PushTestOptions>
{
    public ValidateOptionsResult Validate(string? name, PushTestOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrWhiteSpace(options.TargetEmail) && options.FirstAt is null)
        {
            return ValidateOptionsResult.Success;
        }

        return options.IsEnabled && MailAddress.TryCreate(options.TargetEmail, out var address)
            && address.Address == options.TargetEmail
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail("PushTest needs a target email and an absolute FirstAt timestamp, or neither.");
    }
}

internal sealed partial class PushTestRunner(
    IApplicationDbContext db,
    IPushSettings settings,
    IPushSender sender,
    IPushAddressProtector protector,
    TimeProvider time,
    ILogger<PushTestRunner> logger)
{
    public static readonly TimeSpan DeliveryWindow = TimeSpan.FromMinutes(15);

    public async Task<DateTimeOffset?> RunDueAsync(string targetEmail, DateTimeOffset firstAt, CancellationToken cancellationToken)
    {
        if (!settings.IsEnabled)
        {
            return null;
        }

        var now = time.GetUtcNow();
        DateTimeOffset[] slots = [firstAt, firstAt.AddHours(1)];
        var next = slots.Where(s => s > now).Cast<DateTimeOffset?>().FirstOrDefault();
        foreach (var slot in slots.Where(s => s <= now && now <= s + DeliveryWindow))
        {
            // Refuse an ambiguous email rather than notifying a different identity with the same address.
            var runnerIds = await db.Runners.AsNoTracking().Where(r => r.Email == targetEmail)
                .Select(r => r.Id).Take(2).ToListAsync(cancellationToken);
            if (runnerIds.Count != 1)
            {
                LogTargetUnavailable(logger);
                continue;
            }

            var runnerId = runnerIds[0];
            var devices = await db.PushSubscriptions.Where(d => d.RunnerId == runnerId)
                .ToListAsync(cancellationToken);
            var accepted = 0;
            foreach (var device in devices.Where(d => d.LastTestPushAt is null || d.LastTestPushAt < slot))
            {
                device.MarkTestPush(slot);
                try
                {
                    // SQL rowversion claims before sending, preventing duplicates across overlapping instances.
                    await db.SaveChangesAsync(cancellationToken);
                }
                catch (DbUpdateConcurrencyException)
                {
                    db.PushSubscriptions.Entry(device).State = EntityState.Detached;
                    continue;
                }

                try
                {
                    var address = new PushAddress(protector.Unprotect(device.Endpoint), protector.Unprotect(device.P256dh), protector.Unprotect(device.Auth));
                    var number = slot == firstAt ? 1 : 2;
                    var message = new PushMessage("Taperday notification test", $"Test {number} of 2. Your PWA notifications are working.",
                        "/?view=account", $"test-{slot.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture)}");
                    if (await sender.SendAsync(address, message, cancellationToken))
                    {
                        accepted++;
                    }
                    else
                    {
                        db.PushSubscriptions.Remove(device);
                        await db.SaveChangesAsync(cancellationToken);
                    }
                }
                catch (PushUnavailableException)
                {
                    LogNotAccepted(logger);
                }
            }

            LogPass(logger, devices.Count, accepted);
        }

        return next;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Push test skipped: target does not resolve to exactly one runner")]
    private static partial void LogTargetUnavailable(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Push test was not accepted by its push service; this slot will not be retried")]
    private static partial void LogNotAccepted(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Push test checked {DeviceCount} registered devices; {AcceptedCount} pushes accepted by push services")]
    private static partial void LogPass(ILogger logger, int deviceCount, int acceptedCount);
}

internal sealed partial class PushTestWorker(
    IServiceScopeFactory scopes,
    IOptions<PushTestOptions> options,
    TimeProvider time,
    ILogger<PushTestWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = options.Value;
        if (!config.IsEnabled)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            DateTimeOffset? next;
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                next = await scope.ServiceProvider.GetRequiredService<PushTestRunner>()
                    .RunDueAsync(config.TargetEmail, config.FirstAt!.Value, stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                LogFailed(logger);
                if (time.GetUtcNow() > config.FirstAt!.Value.AddHours(1) + PushTestRunner.DeliveryWindow)
                {
                    return;
                }

                next = time.GetUtcNow().AddMinutes(1);
            }

            if (next is null)
            {
                return;
            }

            var delay = next.Value - time.GetUtcNow();
            if (delay > TimeSpan.Zero)
            {
                await Task.Delay(delay, time, stoppingToken);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Push test pass failed; retrying within the finite diagnostic window")]
    private static partial void LogFailed(ILogger logger);
}
