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
using StartLine.Application.Features.Notifications;
using StartLine.Application.Features.Sync;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
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
    bool HeartRateConsent,
    bool UpdateEmails,
    DateTimeOffset? UpdateEmailsOffAt)
{
    public static RunnerDto From(Runner r)
    {
        ArgumentNullException.ThrowIfNull(r);
        return new(r.Id, r.DisplayName, r.Email, r.TimeZone, r.Units, r.WeeklyEmails, r.ConsentedAt, r.MaxHeartRate,
            r.PrivacyNoticeVersion, !r.HasAccepted(PrivacyNotice.CurrentVersion), r.HeartRateConsent, r.UpdateEmails, r.UpdateEmailsOffAt);
    }
}

/// <summary>
/// The privacy notice the app currently shows. Bump it when the notice changes: runners who accepted an older version
/// are asked to accept again before they save, upload or connect anything (<see cref="CurrentRunner.RequireConsentedAsync"/>).
/// </summary>
public static class PrivacyNotice
{
    /// <summary>
    /// 2026-10-25: adds reminders (a device's push address, kept only if the runner turns them on, and the browsers' push
    /// services that carry them). 2026-10-21 named uploaded and synced runs, heart rate (asked for separately), Strava, and
    /// the contact.
    /// </summary>
    public const string CurrentVersion = "2026-10-25";
}

/// <summary>Signs up on first call, updates the profile after. Email comes from the token, never the body.</summary>
public sealed record SaveProfileCommand(
    string DisplayName,
    string TimeZone,
    Units Units,
    bool WeeklyEmails,
    bool AcceptPrivacyNotice,
    int? MaxHeartRate = null,
    bool? HeartRateConsent = null,
    bool? UpdateEmails = null) : IRequest<RunnerDto>;

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
            SetUpdateEmails(runner, request.UpdateEmails);
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
        SetUpdateEmails(runner, request.UpdateEmails);
        if (request.HeartRateConsent is { } consent && runner.SetHeartRateConsent(consent, time.GetUtcNow()))
        {
            await heartRate.ForgetAsync(runner.Id, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return RunnerDto.From(runner);
    }

    // Left out (an older app), the choice stays as it is: saving a name must never quietly subscribe or unsubscribe anyone.
    private void SetUpdateEmails(Runner runner, bool? updateEmails)
    {
        if (updateEmails == true)
        {
            runner.TurnOnUpdateEmails();
        }
        else if (updateEmails == false)
        {
            runner.TurnOffUpdateEmails(time.GetUtcNow());
        }
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
    IReadOnlyList<CoachExportDto> Coaching,
    IReadOnlyList<ReminderDeviceDto> Reminders,
    IReadOnlyList<TickPromptExportDto> TickPrompts,
    RunnerPhotoDto? Photo,
    IReadOnlyList<NotificationHistoryDto>? NotificationHistory = null,
    IReadOnlyList<Insights.FeedbackNoteDto>? Feedback = null,
    IReadOnlyList<ShoeExportDto>? Shoes = null);

/// <summary>A pair of shoes as exported: the pair, and which runs (by id) and check-ins were worn in it.</summary>
public sealed record ShoeExportDto(Shoes.ShoeDto Shoe, IReadOnlyList<Guid> ActivityIds, IReadOnlyList<Guid> CheckInIds);

public sealed record NotificationHistoryDto(Guid DeviceId, Guid SubjectId, Domain.Notifications.NotificationKind Kind,
    string Event, DateTimeOffset NotBefore, DateTimeOffset ExpiresAt, DateTimeOffset? ClaimedAt);

/// <summary>A session the runner was asked to tick, after a run from Strava matched it: the session, and nothing of the run.</summary>
public sealed record TickPromptExportDto(Guid PlanId, DateOnly Date, SessionType SessionType);

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

internal sealed class ExportAccountHandler(IApplicationDbContext db, CurrentRunner current, PersonalBests personalBests, TimeProvider time, Shoes.ShoeMileage mileage)
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
        var reminders = await db.PushSubscriptions.AsNoTracking()
            .Where(s => s.RunnerId == runner.Id)
            .OrderBy(s => s.CreatedAt)
            .ToListAsync(cancellationToken);
        var photo = await db.RunnerPhotos.AsNoTracking().SingleOrDefaultAsync(p => p.RunnerId == runner.Id, cancellationToken);
        var deviceIds = reminders.Select(d => d.Id).ToList();
        var notificationHistory = await db.NotificationDeliveries.AsNoTracking().Where(d => deviceIds.Contains(d.DeviceId))
            .OrderBy(d => d.NotBefore).Select(d => new NotificationHistoryDto(d.DeviceId, d.SubjectId, d.Kind, d.EventKey,
                d.NotBefore, d.ExpiresAt, d.ClaimedAt)).ToListAsync(cancellationToken);
        var asked = await db.TickPrompts.AsNoTracking()
            .Where(p => planIds.Contains(p.SavedPlanId))
            .OrderBy(p => p.Date)
            .ToListAsync(cancellationToken);
        return new AccountExportDto(
            RunnerDto.From(runner),
            [.. plans.Select(SavedPlanExportDto.From)],
            [.. activities.Select(a => ActivityDto.From(a, bests.FromRunsOtherThan(a.Id), runner.MaxHeartRate))],
            [.. connections.Select(ConnectionExportDto.From)],
            [.. checkIns.Select(c => new CheckInExportDto(c.SavedPlanId, CheckInDto.From(c)))],
            [.. coachWeeks.Select(w => new CoachExportDto(w.SavedPlanId, CoachNoteDto.From(w.ToDecision())))],
            [.. reminders.Select(ReminderDeviceDto.From)],
            [.. asked.Select(p => new TickPromptExportDto(p.SavedPlanId, p.Date, p.SessionType))],
            photo is null ? null : RunnerPhotoDto.From(photo), notificationHistory,
            await db.Feedback.AsNoTracking().Where(f => f.RunnerId == runner.Id).OrderBy(f => f.CreatedAt)
                .Select(f => new Insights.FeedbackNoteDto(f.Message, f.Page, f.CreatedAt)).ToListAsync(cancellationToken),
            await ShoesAsync(runner.Id, cancellationToken));
    }

    private async Task<IReadOnlyList<ShoeExportDto>> ShoesAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        var shoes = await db.Shoes.AsNoTracking().Where(s => s.RunnerId == runnerId).OrderBy(s => s.CreatedAt).ToListAsync(cancellationToken);
        var worn = await db.ShoeAssignments.AsNoTracking().Where(a => a.RunnerId == runnerId).ToListAsync(cancellationToken);
        var totals = await mileage.ForRunnerAsync(runnerId, cancellationToken);
        return [.. shoes.Select(s => new ShoeExportDto(
            Shoes.ShoeViews.From(s, totals.GetValueOrDefault(s.Id)),
            [.. worn.Where(a => a.ShoeId == s.Id && a.ActivityId != null).Select(a => a.ActivityId!.Value)],
            [.. worn.Where(a => a.ShoeId == s.Id && a.CheckInId != null).Select(a => a.CheckInId!.Value)]))];
    }
}

/// <summary>
/// Deletes the runner and everything they saved, plans, runs, connections and reminders (POPIA right to erasure). Strava is asked
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

        // Saved plans, activities, connections, sync jobs and reminder devices go with the runner through the database's cascade delete.
        db.Runners.Remove(runner);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
