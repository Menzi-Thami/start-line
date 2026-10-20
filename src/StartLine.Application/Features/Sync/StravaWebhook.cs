using System.Security.Cryptography;
using System.Text;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Sync;

internal static class HookSecret
{
    /// <summary>The webhook path's secret segment, compared in constant time. A wrong one looks like any unknown URL.</summary>
    public static void Check(IStravaSettings settings, string secret)
    {
        var expected = Encoding.UTF8.GetBytes(settings.HookSecret);
        if (!settings.IsEnabled || expected.Length == 0 || !CryptographicOperations.FixedTimeEquals(expected, Encoding.UTF8.GetBytes(secret ?? "")))
        {
            throw new NotFoundException("Webhook", "strava");
        }
    }
}

/// <summary>Strava checking the callback while the push subscription is created: echo the challenge if the token matches.</summary>
public sealed record VerifyStravaWebhookQuery(string Secret, string? Mode, string? VerifyToken, string? Challenge) : IRequest<string>;

internal sealed class VerifyStravaWebhookHandler(IStravaSettings settings) : IRequestHandler<VerifyStravaWebhookQuery, string>
{
    public Task<string> Handle(VerifyStravaWebhookQuery request, CancellationToken cancellationToken)
    {
        HookSecret.Check(settings, request.Secret);
        var expected = Encoding.UTF8.GetBytes(settings.VerifyToken);
        if (request.Mode != "subscribe" || string.IsNullOrEmpty(request.Challenge) || expected.Length == 0
            || !CryptographicOperations.FixedTimeEquals(expected, Encoding.UTF8.GetBytes(request.VerifyToken ?? "")))
        {
            throw new ForbiddenException("webhook_verification_failed", "That isn't the verify token Taperday expects.");
        }

        return Task.FromResult(request.Challenge);
    }
}

/// <summary>One event as Strava pushes it. See developers.strava.com/docs/webhooks.</summary>
public sealed record StravaEvent(
    string ObjectType,
    long ObjectId,
    string AspectType,
    long OwnerId,
    long SubscriptionId,
    long EventTime,
    IReadOnlyDictionary<string, string>? Updates);

/// <summary>
/// An event from Strava. Strava doesn't sign events, so an event is only ever a hint: it's checked against our
/// subscription and a connected athlete, then queued. The worker reads the run from Strava with that runner's own
/// token, so a forged event can't put anything into anyone's account.
/// </summary>
public sealed record ReceiveStravaEventCommand(string Secret, StravaEvent Event) : IRequest<bool>;

internal sealed class ReceiveStravaEventValidator : AbstractValidator<ReceiveStravaEventCommand>
{
    public ReceiveStravaEventValidator()
    {
        RuleFor(c => c.Event).NotNull();
        RuleFor(c => c.Event.ObjectType).MaximumLength(16).When(c => c.Event is not null);
        RuleFor(c => c.Event.AspectType).MaximumLength(16).When(c => c.Event is not null);
        RuleFor(c => c.Event.Updates).Must(u => u is null || u.Count <= 10).When(c => c.Event is not null);
    }
}

internal sealed class ReceiveStravaEventHandler(IApplicationDbContext db, IStravaSettings settings, ISyncSignal signal, TimeProvider time)
    : IRequestHandler<ReceiveStravaEventCommand, bool>
{
    /// <returns>True when the event was queued; false when it was for someone or something Taperday doesn't track.</returns>
    public async Task<bool> Handle(ReceiveStravaEventCommand request, CancellationToken cancellationToken)
    {
        HookSecret.Check(settings, request.Secret);
        var e = request.Event;
        if (settings.SubscriptionId is not { } ours || e.SubscriptionId != ours)
        {
            return false;
        }

        var connection = await db.ProviderConnections.AsNoTracking()
            .SingleOrDefaultAsync(c => c.Provider == SyncProvider.Strava && c.ExternalAthleteId == e.OwnerId, cancellationToken);
        if (connection is null)
        {
            return false;
        }

        var now = time.GetUtcNow();
        SyncJob? job = (e.ObjectType, e.AspectType) switch
        {
            ("athlete", "update") when e.Updates?.GetValueOrDefault("authorized") == "false" =>
                SyncJob.Create(connection.RunnerId, SyncProvider.Strava, SyncJobKind.Deauthorize, null, SyncPriority.Delete, now),
            ("activity", "create" or "update") when e.ObjectId > 0 =>
                SyncJob.Create(connection.RunnerId, SyncProvider.Strava, SyncJobKind.FetchActivity, e.ObjectId, SyncPriority.Live, now),
            ("activity", "delete") when e.ObjectId > 0 =>
                SyncJob.Create(connection.RunnerId, SyncProvider.Strava, SyncJobKind.DeleteActivity, e.ObjectId, SyncPriority.Delete, now),
            _ => null,
        };
        if (job is null)
        {
            return false;
        }

        await StravaStatus.EnqueueAsync(db, job, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        signal.Wake();
        return true;
    }
}
