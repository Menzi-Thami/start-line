using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using StartLine.Domain.Races;

namespace StartLine.Application.Features.Races;

public sealed record RaceSyncResult(int Races, IReadOnlyList<string> FailedSources, bool StoreUpdated);

/// <summary>
/// Pulls every source, reconciles them and publishes the result. Decisions, named:
/// - Sources run concurrently; there are a handful, so no cap beyond the source count.
/// - Each source gets <see cref="SourceTimeout"/>; a slow source can't hold the calendar hostage.
/// - Partial failure: a source that fails or times out contributes its last good result, so one
///   outage never deletes races. If no source has ever succeeded, the store is left untouched.
/// - Failures are logged as warnings with the source name and never surface to runners.
/// </summary>
public sealed partial class RaceCalendarSync(
    IEnumerable<IRaceSource> sources,
    IRaceStore store,
    TimeProvider timeProvider,
    ILogger<RaceCalendarSync> logger)
{
    public static readonly TimeSpan SourceTimeout = TimeSpan.FromSeconds(30);

    private readonly ConcurrentDictionary<string, IReadOnlyList<RaceObservation>> _lastGood = new(StringComparer.Ordinal);

    public async Task<RaceSyncResult> RunAsync(CancellationToken cancellationToken)
    {
        var results = await Task.WhenAll(sources.Select(source => FetchAsync(source, cancellationToken)));

        var failed = results.Where(r => !r.Succeeded).Select(r => r.Source).ToList();
        if (_lastGood.IsEmpty)
        {
            LogNothingToPublish(logger);
            return new RaceSyncResult(0, failed, StoreUpdated: false);
        }

        var races = RaceReconciler.Reconcile(_lastGood.Values.SelectMany(o => o));
        store.Replace(races, timeProvider.GetUtcNow());
        LogPublished(logger, races.Count, _lastGood.Count, failed.Count);
        return new RaceSyncResult(races.Count, failed, StoreUpdated: true);
    }

    private async Task<(string Source, bool Succeeded)> FetchAsync(IRaceSource source, CancellationToken cancellationToken)
    {
        using var timeout = new CancellationTokenSource(SourceTimeout, timeProvider);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
        try
        {
            _lastGood[source.Name] = await source.FetchAsync(linked.Token).WaitAsync(linked.Token);
            return (source.Name, true);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogSourceTimedOut(logger, source.Name, SourceTimeout);
            return (source.Name, false);
        }
#pragma warning disable CA1031 // Deliberate: any one source's failure falls back to its last good data (see class remarks).
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSourceFailed(logger, exception, source.Name);
            return (source.Name, false);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Race source {Source} failed; keeping its last good data")]
    private static partial void LogSourceFailed(ILogger logger, Exception exception, string source);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Race source {Source} timed out after {Timeout}; keeping its last good data")]
    private static partial void LogSourceTimedOut(ILogger logger, string source, TimeSpan timeout);

    [LoggerMessage(Level = LogLevel.Warning, Message = "No race source has succeeded yet; the calendar was not updated")]
    private static partial void LogNothingToPublish(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Published {Races} races from {Sources} sources ({Failed} failed this run)")]
    private static partial void LogPublished(ILogger logger, int races, int sources, int failed);
}
