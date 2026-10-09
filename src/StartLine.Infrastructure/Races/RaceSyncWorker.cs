using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Races;

namespace StartLine.Infrastructure.Races;

/// <summary>
/// Re-syncs the race calendar on a timer. The first sync runs at startup, before the app serves
/// requests (see Program.cs), so this only handles the repeats. The timer runs on the injected
/// TimeProvider, which is what lets tests advance hours instantly.
/// </summary>
internal sealed class RaceSyncWorker(RaceCalendarSync sync, IOptions<RaceCalendarOptions> options, TimeProvider timeProvider)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(options.Value.SyncInterval, timeProvider);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await sync.RunAsync(stoppingToken);
        }
    }
}
