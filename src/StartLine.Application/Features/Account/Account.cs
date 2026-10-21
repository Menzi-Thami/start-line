using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.Coaching;
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
    int? MaxHeartRate,
    string PrivacyNoticeVersion,
    bool NeedsPrivacyConsent,
    bool HeartRateConsent)
{
    public static RunnerDto From(Runner r)
    {
        ArgumentNullException.ThrowIfNull(r);
        return new(r.Id, r.DisplayName, r.Email, r.TimeZone, r.Units, r.WeeklyEmails, r.ConsentedAt, r.MaxHeartRate,
            r.PrivacyNoticeVersion, !r.HasAccepted(PrivacyNotice.CurrentVersion), r.HeartRateConsent);
    }
}

/// <summary>
/// The privacy notice the app currently shows. Bump it when the notice changes: runners who accepted an older version
/// are asked to accept again before they save, upload or connect anything (<see cref="CurrentRunner.RequireConsentedAsync"/>).
/// </summary>
public static class PrivacyNotice
{
    /// <summary>2026-10-21: names uploaded and synced runs, heart rate (asked for separately), Strava, and the contact.</summary>
    public const string CurrentVersion = "2026-10-21";
}

/// <summary>Signs up on first call, updates the profile after. Email comes from the token, never the body.</summary>
public sealed record SaveProfileCommand(
    string DisplayName,
    string TimeZone,
    Units Units,
    bool WeeklyEmails,
    bool AcceptPrivacyNotice,
    int? MaxHeartRate = null,
    bool? HeartRateConsent = null) : IRequest<RunnerDto>;

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

internal sealed class SaveProfileHandler(IApplicationDbContext db, CurrentRunner current, ICurrentUser user, TimeProvider time, HeartRateData heartRate)
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
                request.WeeklyEmails, PrivacyNotice.CurrentVersion, time.GetUtcNow(), request.MaxHeartRate, request.HeartRateConsent ?? false);
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
        if (request.HeartRateConsent is { } consent && runner.SetHeartRateConsent(consent, time.GetUtcNow()))
        {
            await heartRate.ForgetAsync(runner.Id, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return RunnerDto.From(runner);
    }
}

/// <summary>
/// Accepts the current privacy notice, for a runner who signed up under an older one, with their heart-rate choice.
/// Saying no to heart rate deletes any already stored.
/// </summary>
public sealed record AcceptPrivacyNoticeCommand(bool HeartRateConsent) : IRequest<RunnerDto>;

internal sealed class AcceptPrivacyNoticeHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time, HeartRateData heartRate)
    : IRequestHandler<AcceptPrivacyNoticeCommand, RunnerDto>
{
    public async Task<RunnerDto> Handle(AcceptPrivacyNoticeCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var now = time.GetUtcNow();
        runner.AcceptPrivacyNotice(PrivacyNotice.CurrentVersion, now);
        if (runner.SetHeartRateConsent(request.HeartRateConsent, now) || !request.HeartRateConsent)
        {
            // Also when consent was never given: heart rate kept from before consent was asked for goes too.
            await heartRate.ForgetAsync(runner.Id, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return RunnerDto.From(runner);
    }
}

/// <summary>Removes stored heart rate from every run of a runner, when they withdraw (or don't give) consent.</summary>
internal sealed class HeartRateData(IApplicationDbContext db)
{
    /// <summary>Loads and scrubs the runner's runs; the caller saves.</summary>
    public async Task ForgetAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        var runs = await db.Activities.Where(a => a.RunnerId == runnerId).ToListAsync(cancellationToken);
        foreach (var run in runs)
        {
            run.ForgetHeartRate();
        }
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
    IReadOnlyList<ConnectionExportDto> Connections,
    IReadOnlyList<CheckInExportDto> CheckIns,
    IReadOnlyList<CoachExportDto> Coaching);

/// <summary>A coach's call as exported with the account: which plan and week it was for, then the call.</summary>
public sealed record CoachExportDto(Guid PlanId, CoachNoteDto Call);

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
        var planIds = plans.Select(p => p.Id).ToList();
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => planIds.Contains(c.SavedPlanId))
            .OrderBy(c => c.Date)
            .ToListAsync(cancellationToken);
        var coachWeeks = await db.CoachWeeks.AsNoTracking()
            .Where(w => planIds.Contains(w.SavedPlanId))
            .OrderBy(w => w.WeekStart)
            .ToListAsync(cancellationToken);
        return new AccountExportDto(
            RunnerDto.From(runner),
            [.. plans.Select(SavedPlanExportDto.From)],
            [.. activities.Select(a => ActivityDto.From(a, bests.FromRunsOtherThan(a.Id), runner.MaxHeartRate))],
            [.. connections.Select(ConnectionExportDto.From)],
            [.. checkIns.Select(c => new CheckInExportDto(c.SavedPlanId, CheckInDto.From(c)))],
            [.. coachWeeks.Select(w => new CoachExportDto(w.SavedPlanId, CoachNoteDto.From(w.ToDecision())))]);
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
