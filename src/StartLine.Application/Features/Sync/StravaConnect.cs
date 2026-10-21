using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Domain.Activities;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Sync;

/// <summary>Whether Strava sync is offered, and how it stands for this runner.</summary>
public sealed record StravaStatusDto(
    bool Available,
    bool Connected,
    ConnectionStatus? Status,
    bool IncludesPrivateRuns,
    DateTimeOffset? ConnectedAt,
    DateTimeOffset? LastSyncedAt,
    int Pending,
    int Failed,
    int SyncedRuns);

public sealed record StravaConnectDto(Uri AuthorizeUrl);

public sealed record StravaDisconnectedDto(int DeletedRuns);

internal static class StravaStatus
{
    public static async Task<StravaStatusDto> ForAsync(IApplicationDbContext db, IStravaSettings settings, Guid? runnerId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var connection = runnerId is { } id
            ? await db.ProviderConnections.AsNoTracking().SingleOrDefaultAsync(c => c.RunnerId == id && c.Provider == SyncProvider.Strava, cancellationToken)
            : null;
        if (connection is null)
        {
            return new StravaStatusDto(settings.IsEnabled, false, null, false, null, null, 0, 0, 0);
        }

        var jobs = await db.SyncJobs.AsNoTracking()
            .Where(j => j.RunnerId == connection.RunnerId && j.Provider == SyncProvider.Strava && j.Kind != SyncJobKind.Refresh)
            .GroupBy(j => j.Failed)
            .Select(g => new { Failed = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var runs = await db.Activities.AsNoTracking().Visible(now)
            .CountAsync(a => a.RunnerId == connection.RunnerId && a.Source == ActivitySource.Strava, cancellationToken);
        return new StravaStatusDto(
            settings.IsEnabled,
            true,
            connection.Status,
            connection.IncludesPrivateRuns,
            connection.ConnectedAt,
            connection.LastSyncedAt,
            jobs.Where(j => !j.Failed).Sum(j => j.Count),
            jobs.Where(j => j.Failed).Sum(j => j.Count),
            runs);
    }

    /// <summary>Adds a job unless the same one is already waiting: Strava often sends one change as several events.</summary>
    public static async Task EnqueueAsync(IApplicationDbContext db, SyncJob job, CancellationToken cancellationToken)
    {
        var waiting = await db.SyncJobs.AnyAsync(
            j => j.RunnerId == job.RunnerId && j.Provider == job.Provider && j.Kind == job.Kind && j.ObjectId == job.ObjectId && !j.Failed,
            cancellationToken);
        if (!waiting && !db.SyncJobs.Local.Any(j => j.RunnerId == job.RunnerId && j.Kind == job.Kind && j.ObjectId == job.ObjectId && !j.Failed))
        {
            db.SyncJobs.Add(job);
        }
    }

    /// <summary>Everything synced from Strava for a runner: the connection, its runs and its waiting work.</summary>
    public static async Task<int> ForgetAsync(IApplicationDbContext db, Guid runnerId, CancellationToken cancellationToken)
    {
        var runs = await db.Activities.Where(a => a.RunnerId == runnerId && a.Source == ActivitySource.Strava).ToListAsync(cancellationToken);
        db.Activities.RemoveRange(runs);
        db.SyncJobs.RemoveRange(await db.SyncJobs.Where(j => j.RunnerId == runnerId && j.Provider == SyncProvider.Strava).ToListAsync(cancellationToken));
        db.ProviderConnections.RemoveRange(await db.ProviderConnections
            .Where(c => c.RunnerId == runnerId && c.Provider == SyncProvider.Strava).ToListAsync(cancellationToken));
        return runs.Count;
    }
}

public sealed record GetStravaStatusQuery : IRequest<StravaStatusDto>;

internal sealed class GetStravaStatusHandler(IApplicationDbContext db, CurrentRunner current, IStravaSettings settings, TimeProvider time)
    : IRequestHandler<GetStravaStatusQuery, StravaStatusDto>
{
    public async Task<StravaStatusDto> Handle(GetStravaStatusQuery request, CancellationToken cancellationToken) =>
        await StravaStatus.ForAsync(db, settings, (await current.FindAsync(cancellationToken))?.Id, time.GetUtcNow(), cancellationToken);
}

/// <summary>Starts connecting: the Strava page the runner approves Taperday on.</summary>
public sealed record StartStravaConnectQuery : IRequest<StravaConnectDto>;

internal sealed class StartStravaConnectHandler(CurrentRunner current, IStravaSettings settings, IStravaApi strava, IConnectState state)
    : IRequestHandler<StartStravaConnectQuery, StravaConnectDto>
{
    public async Task<StravaConnectDto> Handle(StartStravaConnectQuery request, CancellationToken cancellationToken)
    {
        if (!settings.IsEnabled)
        {
            throw new ConflictException("strava_unavailable", "Strava sync isn't switched on yet.");
        }

        var runner = await current.RequireConsentedAsync(cancellationToken);
        return new StravaConnectDto(strava.AuthorizeUrl(state.Issue(runner.Id), settings.RedirectUri));
    }
}

/// <summary>Finishes connecting with what Strava sent back to the callback page.</summary>
public sealed record ConnectStravaCommand(string Code, string State, string? Scope) : IRequest<StravaStatusDto>;

internal sealed class ConnectStravaValidator : AbstractValidator<ConnectStravaCommand>
{
    public ConnectStravaValidator()
    {
        RuleFor(c => c.Code).NotEmpty().MaximumLength(200);
        RuleFor(c => c.State).NotEmpty().MaximumLength(2000);
        RuleFor(c => c.Scope)
            .Must(scope => (scope ?? "").Split(',', StringSplitOptions.TrimEntries).Any(s => s is "activity:read" or ProviderConnection.StravaPrivateRunsScope))
            .WithMessage("Taperday needs to see your runs. Connect again and leave “View data about your activities” ticked.")
            .MaximumLength(ProviderConnection.MaxScopesLength);
    }
}

internal sealed class ConnectStravaHandler(
    IApplicationDbContext db,
    CurrentRunner current,
    IStravaSettings settings,
    IStravaApi strava,
    IConnectState state,
    StravaTokens tokens,
    ISyncSignal signal,
    TimeProvider time)
    : IRequestHandler<ConnectStravaCommand, StravaStatusDto>
{
    public async Task<StravaStatusDto> Handle(ConnectStravaCommand request, CancellationToken cancellationToken)
    {
        if (!settings.IsEnabled)
        {
            throw new ConflictException("strava_unavailable", "Strava sync isn't switched on yet.");
        }

        var runner = await current.RequireConsentedAsync(cancellationToken);
        if (state.Read(request.State) != runner.Id)
        {
            throw new Common.Exceptions.ValidationException(new Dictionary<string, string[]> { ["state"] = ["That link was started from another account. Connect again from here."] });
        }

        var grant = await strava.ExchangeCodeAsync(request.Code, cancellationToken);
        var athleteId = grant.AthleteId ?? throw new StravaUnavailableException("Strava didn't say whose account this is.");
        if (await db.ProviderConnections.AnyAsync(c => c.Provider == SyncProvider.Strava && c.ExternalAthleteId == athleteId && c.RunnerId != runner.Id, cancellationToken))
        {
            throw new ConflictException("strava_in_use", "That Strava account is already connected to another Taperday account.");
        }

        var now = time.GetUtcNow();
        var existing = await db.ProviderConnections.SingleOrDefaultAsync(c => c.RunnerId == runner.Id && c.Provider == SyncProvider.Strava, cancellationToken);
        if (existing is not null)
        {
            // Connecting again replaces the old link (and anything synced through it) rather than patching it.
            await StravaStatus.ForgetAsync(db, runner.Id, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        db.ProviderConnections.Add(ProviderConnection.Connect(runner.Id, SyncProvider.Strava, athleteId, request.Scope!, tokens.Protect(grant), now));
        db.SyncJobs.Add(SyncJob.Create(runner.Id, SyncProvider.Strava, SyncJobKind.Backfill, null, SyncPriority.Backfill, now));
        db.SyncJobs.Add(SyncJob.Create(runner.Id, SyncProvider.Strava, SyncJobKind.Refresh, null, SyncPriority.Refresh, now, now.AddDays(1)));
        await db.SaveChangesAsync(cancellationToken);
        signal.Wake();
        return await StravaStatus.ForAsync(db, settings, runner.Id, now, cancellationToken);
    }
}

/// <summary>
/// Disconnects: revokes Taperday's access at Strava, then deletes the connection and every run synced through it.
/// The response is the written confirmation Strava's policy (2.5) asks for.
/// </summary>
public sealed record DisconnectStravaCommand : IRequest<StravaDisconnectedDto>;

internal sealed class DisconnectStravaHandler(
    IApplicationDbContext db,
    CurrentRunner current,
    IStravaApi strava,
    StravaTokens tokens,
    ILogger<DisconnectStravaHandler> logger)
    : IRequestHandler<DisconnectStravaCommand, StravaDisconnectedDto>
{
    public async Task<StravaDisconnectedDto> Handle(DisconnectStravaCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        var connection = await db.ProviderConnections.SingleOrDefaultAsync(c => c.RunnerId == runner.Id && c.Provider == SyncProvider.Strava, cancellationToken);
        if (connection is not null)
        {
            await StravaRevoke.TryAsync(strava, tokens, connection, logger, cancellationToken);
        }

        var deleted = await StravaStatus.ForgetAsync(db, runner.Id, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return new StravaDisconnectedDto(deleted);
    }
}

internal static partial class StravaRevoke
{
    /// <summary>
    /// Tells Strava to revoke the tokens. Best effort: if Strava can't be reached the runner's data is still deleted
    /// here, and the tokens die with the connection row, so nothing can use them.
    /// </summary>
    public static async Task TryAsync(IStravaApi strava, StravaTokens tokens, ProviderConnection connection, ILogger logger, CancellationToken cancellationToken)
    {
        try
        {
            await strava.DeauthorizeAsync(await tokens.AccessTokenAsync(connection, cancellationToken), cancellationToken);
        }
        catch (Exception e) when (e is StravaUnauthorizedException or StravaUnavailableException or StravaRateLimitedException)
        {
            LogRevokeFailed(logger, e);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Couldn't revoke a Strava connection at Strava; deleting it here anyway")]
    private static partial void LogRevokeFailed(ILogger logger, Exception exception);
}

/// <summary>
/// The plan was opened: ask Strava for anything since the last sync, in case a push was missed while the app slept.
/// At most every <see cref="ProviderConnection.CatchUpInterval"/>.
/// </summary>
public sealed record CatchUpStravaCommand : IRequest<StravaStatusDto>;

internal sealed class CatchUpStravaHandler(IApplicationDbContext db, CurrentRunner current, IStravaSettings settings, ISyncSignal signal, TimeProvider time)
    : IRequestHandler<CatchUpStravaCommand, StravaStatusDto>
{
    public async Task<StravaStatusDto> Handle(CatchUpStravaCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        var now = time.GetUtcNow();
        var connection = await db.ProviderConnections.SingleOrDefaultAsync(c => c.RunnerId == runner.Id && c.Provider == SyncProvider.Strava, cancellationToken);
        if (settings.IsEnabled && connection is not null && connection.TryStartCatchUp(now))
        {
            await StravaStatus.EnqueueAsync(db, SyncJob.Create(runner.Id, SyncProvider.Strava, SyncJobKind.CatchUp, null, SyncPriority.CatchUp, now), cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            signal.Wake();
        }

        return await StravaStatus.ForAsync(db, settings, runner.Id, now, cancellationToken);
    }
}
