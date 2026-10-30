using System.Runtime.CompilerServices;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using StartLine.Application.Features.Notifications;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Infrastructure.Sync;

namespace StartLine.Infrastructure.Push;

/// <summary>Wakes the reminder worker when something a reminder depends on has changed.</summary>
internal sealed class ReminderSignal : WakeSignal;

/// <summary>
/// Sends reminders. It sleeps until the next one is due, and touches the database only then, at start, and when a
/// plan, a time zone or a device changes; never on an idle tick, so the Azure SQL free offer can still pause. On the
/// free App Service plan the app itself may sleep past a reminder: the outside ping on <c>/health/live</c> keeps it
/// awake, and if it slept anyway, the next start sends what's still due that day (<see cref="IReminderRunner"/>).
/// </summary>
internal sealed partial class ReminderWorker(
    IServiceScopeFactory scopes,
    ReminderSignal signal,
    IPushSettings settings,
    TimeProvider time,
    ILogger<ReminderWorker> logger)
    : BackgroundService
{
    /// <summary>The longest timed sleep: a little over <see cref="Reminders.LookAheadDays"/>, and well inside what a timer can wait.</summary>
    public static readonly TimeSpan LongestSleep = TimeSpan.FromDays(Reminders.LookAheadDays + 1);

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
                var next = await scope.ServiceProvider.GetRequiredService<IReminderRunner>().RunDueAsync(stoppingToken);
                sleep = next is { } due ? due - time.GetUtcNow() : Timeout.InfiniteTimeSpan;
                failures = 0;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // A database blip mustn't stop reminders for good. Nothing was lost; try again shortly.
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

    [LoggerMessage(Level = LogLevel.Error, Message = "Reminder pass failed; retrying shortly")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}

/// <summary>
/// Wakes the reminder worker after a save that changes when a reminder is due: a device turned on or changed, a plan
/// saved, replaced or rebuilt, or a runner's time zone. The worker's own "sent" marks don't wake it again.
/// </summary>
internal sealed class ReminderScheduleInterceptor(ReminderSignal signal) : SaveChangesInterceptor
{
    private readonly ConditionalWeakTable<DbContext, object> pending = [];

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Note(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Note(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        WakeIfNoted(eventData.Context);
        return base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        WakeIfNoted(eventData.Context);
        return base.SavedChanges(eventData, result);
    }

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Forget(eventData.Context);
        return base.SaveChangesFailedAsync(eventData, cancellationToken);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Forget(eventData.Context);
        base.SaveChangesFailed(eventData);
    }

    private void Forget(DbContext? context)
    {
        if (context is not null)
        {
            pending.Remove(context);
        }
    }

    // Noted before the save and acted on after it, so the worker never reads the database before the change is in it.
    private void Note(DbContext? context)
    {
        if (context is not null && context.ChangeTracker.Entries().Any(Matters))
        {
            pending.AddOrUpdate(context, true);
        }
    }

    private void WakeIfNoted(DbContext? context)
    {
        if (context is not null && pending.Remove(context))
        {
            signal.Wake();
        }
    }

    private static bool Matters(Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry entry) => entry.Entity switch
    {
        SavedPlan => entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted,
        Runner => entry.State == EntityState.Modified && entry.Property(nameof(Runner.TimeZone)).IsModified,
        PushSubscription => entry.State == EntityState.Added
            || (entry.State == EntityState.Modified && entry.Properties.Any(p => p.IsModified
                && p.Metadata.Name is not (nameof(PushSubscription.LastRemindedOn) or nameof(PushSubscription.LastTestPushAt) or nameof(PushSubscription.UpdatedAt)))),
        _ => false,
    };
}
