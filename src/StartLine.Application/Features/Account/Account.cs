using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Sync;
using StartLine.Domain.Activities;
using StartLine.Domain.Runners;
using StartLine.Domain.Sync;
using ValidationException = StartLine.Application.Common.Exceptions.ValidationException;

namespace StartLine.Application.Features.Account;

public sealed record RunnerDto(
    Guid Id,
    string DisplayName,
    string? Email,
    string TimeZone,
    Units Units,
    bool WeeklyEmails,
    DateTimeOffset ConsentedAt,
    int? MaxHeartRate)
{
    public static RunnerDto From(Runner r)
    {
        ArgumentNullException.ThrowIfNull(r);
        return new(r.Id, r.DisplayName, r.Email, r.TimeZone, r.Units, r.WeeklyEmails, r.ConsentedAt, r.MaxHeartRate);
    }
}

/// <summary>The privacy notice the app currently shows. Bump it when the notice changes.</summary>
public static class PrivacyNotice
{
    public const string CurrentVersion = "2026-10-09";
}

/// <summary>Signs up on first call, updates the profile after. Email comes from the token, never the body.</summary>
public sealed record SaveProfileCommand(
    string DisplayName,
    string TimeZone,
    Units Units,
    bool WeeklyEmails,
    bool AcceptPrivacyNotice,
    int? MaxHeartRate = null) : IRequest<RunnerDto>;

internal sealed class SaveProfileValidator : AbstractValidator<SaveProfileCommand>
{
    public SaveProfileValidator()
    {
        RuleFor(c => c.DisplayName).NotEmpty().MaximumLength(Runner.MaxNameLength);
        RuleFor(c => c.TimeZone)
            .NotEmpty()
            .MaximumLength(Runner.MaxTimeZoneLength)
            .Must(tz => TimeZoneInfo.TryFindSystemTimeZoneById(tz, out _))
            .WithMessage("That isn't a time zone we recognise.");
        RuleFor(c => c.Units).IsInEnum();
        RuleFor(c => c.MaxHeartRate)
            .InclusiveBetween(HeartRateZones.LowestMaxHeartRate, HeartRateZones.HighestMaxHeartRate)
            .When(c => c.MaxHeartRate is not null)
            .WithMessage($"A max heart rate is between {HeartRateZones.LowestMaxHeartRate} and {HeartRateZones.HighestMaxHeartRate} beats a minute.");
    }
}

internal sealed class SaveProfileHandler(IApplicationDbContext db, CurrentRunner current, ICurrentUser user, TimeProvider time)
    : IRequestHandler<SaveProfileCommand, RunnerDto>
{
    public async Task<RunnerDto> Handle(SaveProfileCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            if (!request.AcceptPrivacyNotice)
            {
                throw new ValidationException(new Dictionary<string, string[]>(StringComparer.Ordinal)
                {
                    [nameof(SaveProfileCommand.AcceptPrivacyNotice)] = ["Please accept the privacy notice to sign up."],
                });
            }

            runner = Runner.Register(current.Subject, user.Email, request.DisplayName, request.TimeZone, request.Units,
                request.WeeklyEmails, PrivacyNotice.CurrentVersion, time.GetUtcNow(), request.MaxHeartRate);
            db.Runners.Add(runner);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return RunnerDto.From(runner);
            }
            catch (DbUpdateException)
            {
                // A parallel sign-up (a double tap, two tabs) created this runner first; the unique index on the
                // identity rejected ours. Update that runner instead. Anything else is a real failure: rethrow.
                db.Runners.Entry(runner).State = EntityState.Detached;
                runner = await current.FindAsync(cancellationToken);
                if (runner is null)
                {
                    throw;
                }
            }
        }

        runner.UpdateProfile(user.Email ?? runner.Email, request.DisplayName, request.TimeZone, request.Units, request.WeeklyEmails, request.MaxHeartRate);
        await db.SaveChangesAsync(cancellationToken);
        return RunnerDto.From(runner);
    }
}

public sealed record GetProfileQuery : IRequest<RunnerDto>;

internal sealed class GetProfileHandler(CurrentRunner current) : IRequestHandler<GetProfileQuery, RunnerDto>
{
    public async Task<RunnerDto> Handle(GetProfileQuery request, CancellationToken cancellationToken) =>
        RunnerDto.From(await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me"));
}

public sealed record AccountExportDto(
    RunnerDto Profile,
    IReadOnlyList<SavedPlanExportDto> Plans,
    IReadOnlyList<ActivityDto> Activities,
    IReadOnlyList<ConnectionExportDto> Connections);

/// <summary>
/// A connected service as exported: what was granted and when, but never the tokens. An export file sitting in a
/// Downloads folder must not be a working key to someone's Strava.
/// </summary>
public sealed record ConnectionExportDto(SyncProvider Provider, long ExternalAthleteId, string Scopes, ConnectionStatus Status, DateTimeOffset ConnectedAt, DateTimeOffset? LastSyncedAt)
{
    public static ConnectionExportDto From(ProviderConnection c)
    {
        ArgumentNullException.ThrowIfNull(c);
        return new(c.Provider, c.ExternalAthleteId, c.Scopes, c.Status, c.ConnectedAt, c.LastSyncedAt);
    }
}

/// <summary>Everything stored about the runner, as one document (POPIA right of access).</summary>
public sealed record ExportAccountQuery : IRequest<AccountExportDto>;

internal sealed class ExportAccountHandler(IApplicationDbContext db, CurrentRunner current, PersonalBests personalBests, TimeProvider time)
    : IRequestHandler<ExportAccountQuery, AccountExportDto>
{
    public async Task<AccountExportDto> Handle(ExportAccountQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var plans = await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runner.Id)
            .OrderBy(p => p.CreatedAt)
            .ToListAsync(cancellationToken);
        var activities = await db.Activities.AsNoTracking()
            .Visible(time.GetUtcNow())
            .Where(a => a.RunnerId == runner.Id)
            .OrderBy(a => a.StartedAt)
            .ToListAsync(cancellationToken);
        var connections = await db.ProviderConnections.AsNoTracking().Where(c => c.RunnerId == runner.Id).ToListAsync(cancellationToken);
        var bests = await personalBests.ForRunnerAsync(runner.Id, cancellationToken);
        return new AccountExportDto(
            RunnerDto.From(runner),
            [.. plans.Select(SavedPlanExportDto.From)],
            [.. activities.Select(a => ActivityDto.From(a, bests.FromRunsOtherThan(a.Id), runner.MaxHeartRate))],
            [.. connections.Select(ConnectionExportDto.From)]);
    }
}

/// <summary>
/// Deletes the runner and everything they saved, plans, runs and connections (POPIA right to erasure). Strava is asked
/// to revoke Taperday first. Sign-in itself lives with the identity provider.
/// </summary>
public sealed record DeleteAccountCommand : IRequest<bool>;

internal sealed class DeleteAccountHandler(
    IApplicationDbContext db,
    CurrentRunner current,
    IStravaApi strava,
    StravaTokens tokens,
    ILogger<DeleteAccountHandler> logger)
    : IRequestHandler<DeleteAccountCommand, bool>
{
    public async Task<bool> Handle(DeleteAccountCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            return false;
        }

        foreach (var connection in await db.ProviderConnections.Where(c => c.RunnerId == runner.Id && c.Provider == SyncProvider.Strava).ToListAsync(cancellationToken))
        {
            await StravaRevoke.TryAsync(strava, tokens, connection, logger, cancellationToken);
        }

        // Saved plans, activities, connections and sync jobs go with the runner through the database's cascade delete.
        db.Runners.Remove(runner);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
