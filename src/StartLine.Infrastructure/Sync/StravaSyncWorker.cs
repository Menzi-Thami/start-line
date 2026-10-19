using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StartLine.Application.Features.Sync;

namespace StartLine.Infrastructure.Sync;

/// <summary>
/// Runs queued Strava work. It sleeps until a webhook or catch-up wakes it, or until the next job is due, and never
/// polls the database while idle: the Azure SQL free offer only pauses (and stays free) when nothing touches it.
/// On the free App Service plan the whole app sleeps too; the work waits in the database until the next request.
/// </summary>
internal sealed partial class StravaSyncWorker(
    IServiceScopeFactory scopes,
    SyncSignal signal,
    IStravaSettings settings,
    TimeProvider time,
    ILogger<StravaSyncWorker> logger)
    : BackgroundService
{
    /// <summary>The longest timed sleep. With nothing queued at all it sleeps until woken, so the database can pause.</summary>
    public static readonly TimeSpan LongestSleep = TimeSpan.FromDays(1);

    /// <summary>First wait after a failed pass; it doubles each time in a row, up to an hour, so a persistent fault doesn't keep the database awake.</summary>
    public static readonly TimeSpan AfterFailure = TimeSpan.FromMinutes(1);

    public static readonly TimeSpan LongestAfterFailure = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!settings.IsEnabled)
        {
            return;
        }

        var failures = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            TimeSpan sleep;
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var next = await scope.ServiceProvider.GetRequiredService<IStravaSync>().RunDueAsync(stoppingToken);
                var now = time.GetUtcNow();
                sleep = next is { } due ? due - now : Timeout.InfiniteTimeSpan;
                failures = 0;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // A database blip mustn't stop syncing for good. The work is still queued; try again shortly.
                LogFailed(logger, e);
                failures++;
                var backoff = AfterFailure * Math.Pow(2, Math.Min(failures - 1, 10));
                sleep = backoff > LongestAfterFailure ? LongestAfterFailure : backoff;
            }

            if (sleep != Timeout.InfiniteTimeSpan)
            {
                sleep = sleep < TimeSpan.Zero ? TimeSpan.Zero : sleep > LongestSleep ? LongestSleep : sleep;
            }

            if (sleep != TimeSpan.Zero)
            {
                await signal.WaitAsync(sleep, time, stoppingToken);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Strava sync pass failed; retrying shortly")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}
