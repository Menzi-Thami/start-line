using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Insights;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Runners;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Onboarding;

/// <summary>What happened to one runner's onboarding email on one attempt.</summary>
public enum OnboardingOutcome
{
    /// <summary>Nothing due: not in a cohort, too soon, or held back by an earlier email.</summary>
    NotDue,

    /// <summary>Already sent, being sent elsewhere, left by a crash mid-send, or given up after <see cref="OnboardingDelivery.MaxAttempts"/>.</summary>
    AlreadyHandled,

    /// <summary>Due when claimed, not when re-checked just before sending: the claim was let go and nothing was sent.</summary>
    Suppressed,

    Sent,

    /// <summary>The send failed; tried again on a later run, up to <see cref="OnboardingDelivery.MaxAttempts"/> in all.</summary>
    Failed,
}

/// <summary>One run of the worker, in counts only (nothing about anyone).</summary>
public sealed record OnboardingRun(int Allowance, int Sent, int Failed);

/// <summary>Sends the onboarding emails due now (see <see cref="OnboardingReminderSender"/>). The hosted worker calls it on a timer.</summary>
public interface IOnboardingReminders
{
    /// <summary>Sends up to <paramref name="budget"/>'s allowance of due emails, newest signups first.</summary>
    Task<OnboardingRun> SendDueAsync(DateTimeOffset now, OnboardingBudget budget, CancellationToken cancellationToken);

    /// <summary>Decides, claims, re-checks and sends for one runner: the unit of work <see cref="SendDueAsync"/> repeats.</summary>
    Task<OnboardingOutcome> SendToAsync(Guid runnerId, DateTimeOffset now, CancellationToken cancellationToken);
}

/// <summary>
/// The onboarding emails (docs/onboarding-reminders.md). Each runner, campaign and episode is claimed in
/// <see cref="OnboardingDelivery"/> before sending, so it goes once however often this runs or however many instances run
/// it. The runner's state is read again after the claim, immediately before sending, and anything that changed (a plan
/// built, a run recorded, updates turned off, the account deleted) lets the claim go without sending.
/// </summary>
internal sealed partial class OnboardingReminderSender(
    IApplicationDbContext db,
    IEmailSender email,
    IUnsubscribeTokens tokens,
    IEmailSettings settings,
    ILogger<OnboardingReminderSender> logger) : IOnboardingReminders
{
    private static readonly TimeSpan Day = TimeSpan.FromDays(1);

    public async Task<OnboardingRun> SendDueAsync(DateTimeOffset now, OnboardingBudget budget, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(budget);
        var allowance = await AllowanceAsync(budget, now, cancellationToken);
        if (allowance == 0)
        {
            return new(0, 0, 0);
        }

        var signedUpBy = now - OnboardingEligibility.SignupWait;
        var rows = await Facts(db.Runners.Where(r => r.CreatedAt <= signedUpBy && r.Email != null && r.Email != "" && r.UpdateEmailsOffAt == null), now)
            .ToListAsync(cancellationToken);
        var due = rows
            .Select(r => (Row: r, Decision: OnboardingEligibility.Classify(r.Facts, now)))
            .Where(d => d.Decision is not null)
            .ToList();
        var ids = due.Select(d => d.Row.Id).ToList();
        var past = (await db.OnboardingDeliveries.AsNoTracking().Where(d => ids.Contains(d.RunnerId)).ToListAsync(cancellationToken))
            .ToLookup(d => d.RunnerId);

        var queue = due
            .Where(d => Open(d.Decision!, past[d.Row.Id], now))
            .OrderByDescending(d => d.Row.Facts.RegisteredAt)
            .Select(d => d.Row.Id)
            .ToList();

        int sent = 0, failed = 0;
        foreach (var runnerId in queue)
        {
            if (sent + failed >= allowance)
            {
                break;
            }

            cancellationToken.ThrowIfCancellationRequested();
            switch (await SendToAsync(runnerId, now, cancellationToken))
            {
                case OnboardingOutcome.Sent:
                    sent++;
                    break;
                case OnboardingOutcome.Failed:
                    failed++;
                    break;
            }
        }

        return new(allowance, sent, failed);
    }

    public async Task<OnboardingOutcome> SendToAsync(Guid runnerId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var row = await FactsAsync(runnerId, now, cancellationToken);
        if (row is null || OnboardingEligibility.Classify(row.Facts, now) is not { } decision)
        {
            return OnboardingOutcome.NotDue;
        }

        var past = await db.OnboardingDeliveries.AsNoTracking().Where(d => d.RunnerId == runnerId).ToListAsync(cancellationToken);
        if (!OnboardingEligibility.Allowed(decision, past.Select(Past), now))
        {
            return OnboardingOutcome.NotDue;
        }

        if (await ClaimAsync(runnerId, decision, past, now, cancellationToken) is not { } claim)
        {
            return OnboardingOutcome.AlreadyHandled;
        }

        // Read again, immediately before sending: a plan built, a run recorded, updates turned off or the account deleted
        // since the first read means no email. A run Strava has in its cache right now holds it back too.
        var fresh = await FactsAsync(runnerId, now, cancellationToken);
        if (fresh is null || OnboardingEligibility.Classify(fresh.Facts, now) != decision)
        {
            await LetGoAsync(claim, cancellationToken);
            return OnboardingOutcome.Suppressed;
        }

        try
        {
            var links = UnsubscribeLinks.For(tokens.Issue(runnerId, EmailList.Updates), settings.ApiBaseUrl);
            await email.SendAsync(OnboardingEmail.Compose(fresh.Email!, decision.Campaign, fresh.DisplayName, links), cancellationToken);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            await FinishAsync(claim, OnboardingDeliveryStatus.Failed, null, cancellationToken);
            LogFailed(logger, claim.Id, decision.Campaign, claim.Attempts, e);
            return OnboardingOutcome.Failed;
        }

        await FinishAsync(claim, OnboardingDeliveryStatus.Sent, now, cancellationToken);
        return OnboardingOutcome.Sent;
    }

    /// <summary>
    /// What's left today: emails sent (or mid-send) in the last 24 hours count against it, the weekly recap's as well as
    /// these, and every runner with the recap on is held a place.
    /// </summary>
    private async Task<int> AllowanceAsync(OnboardingBudget budget, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var since = now - Day;
        var onboarding = await db.OnboardingDeliveries.CountAsync(
            d => (d.Status == OnboardingDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == OnboardingDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        var recaps = await db.WeeklyRecapDeliveries.CountAsync(
            d => (d.Status == RecapDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == RecapDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        var reserve = await db.Runners.CountAsync(r => r.WeeklyEmails && r.Email != null && r.Email != "", cancellationToken);
        return budget.Allowance(onboarding, recaps, reserve);
    }

    // Whether the runner's email may be tried now: allowed by what's gone before, and its own row (if any) open for a retry.
    private static bool Open(OnboardingDecision decision, IEnumerable<OnboardingDelivery> past, DateTimeOffset now)
    {
        var list = past.ToList();
        var own = list.FirstOrDefault(d => d.Campaign == decision.Campaign && d.Episode == decision.Episode);
        return (own is null || own.CanRetry) && OnboardingEligibility.Allowed(decision, list.Select(Past), now);
    }

    private static PastOnboardingEmail Past(OnboardingDelivery d) => new(d.Campaign, d.Episode, d.ClaimedAt, d.MayHaveGone);

    /// <summary>This runner's delivery for the email, claimed for sending now; null when it's sent, being sent, or given up.</summary>
    private async Task<Claimed?> ClaimAsync(Guid runnerId, OnboardingDecision decision, List<OnboardingDelivery> past, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var existing = past.FirstOrDefault(d => d.Campaign == decision.Campaign && d.Episode == decision.Episode);
        if (existing is not null)
        {
            if (!existing.CanRetry)
            {
                return null;
            }

            // Another instance may be retrying the same row: only the one whose update finds it still Failed goes ahead.
            var attempts = existing.Attempts;
            var claimed = await db.OnboardingDeliveries
                .Where(d => d.Id == existing.Id && d.Status == OnboardingDeliveryStatus.Failed && d.Attempts == attempts)
                .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, OnboardingDeliveryStatus.Sending).SetProperty(d => d.Attempts, attempts + 1), cancellationToken);
            return claimed == 0 ? null : new Claimed(existing.Id, attempts + 1);
        }

        var claim = OnboardingDelivery.Claim(runnerId, decision.Campaign, decision.Episode, now);
        db.OnboardingDeliveries.Add(claim);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return new Claimed(claim.Id, claim.Attempts);
        }
        catch (DbUpdateException)
        {
            // Another instance claimed it first (one row per runner, campaign and episode), or the account has just gone.
            db.OnboardingDeliveries.Remove(claim);
            return null;
        }
    }

    // After the claim, every step is a single-row update rather than a tracked change: if the account is deleted mid-send
    // the row goes with it, the update finds nothing, and nothing half-saved is left to trip the rest of the batch.
    private Task<int> FinishAsync(Claimed claim, OnboardingDeliveryStatus status, DateTimeOffset? sentAt, CancellationToken cancellationToken) =>
        db.OnboardingDeliveries
            .Where(d => d.Id == claim.Id && d.Status == OnboardingDeliveryStatus.Sending)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, status).SetProperty(d => d.SentAt, sentAt), cancellationToken);

    // Nothing was sent: a first claim is removed, a retry goes back to Failed with this attempt not counted.
    private Task<int> LetGoAsync(Claimed claim, CancellationToken cancellationToken) => claim.Attempts <= 1
        ? db.OnboardingDeliveries
            .Where(d => d.Id == claim.Id && d.Status == OnboardingDeliveryStatus.Sending)
            .ExecuteDeleteAsync(cancellationToken)
        : db.OnboardingDeliveries
            .Where(d => d.Id == claim.Id && d.Status == OnboardingDeliveryStatus.Sending)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, OnboardingDeliveryStatus.Failed).SetProperty(d => d.Attempts, claim.Attempts - 1), cancellationToken);

    private async Task<FactsRow?> FactsAsync(Guid runnerId, DateTimeOffset now, CancellationToken cancellationToken) =>
        await Facts(db.Runners.Where(r => r.Id == runnerId), now).SingleOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Everything the rules need, in one query per batch. Running evidence is check-ins that aren't skips (on any of the
    /// runner's plans, archived included) and uploads; Strava runs only count while the cache holds them.
    /// </summary>
    private IQueryable<FactsRow> Facts(IQueryable<Runner> runners, DateTimeOffset now) =>
        runners.AsNoTracking().Select(r => new FactsRow(
            r.Id,
            r.Email,
            r.DisplayName,
            new OnboardingFacts(
                r.CreatedAt,
                db.SavedPlans.Where(p => p.RunnerId == r.Id).Min(p => (DateTimeOffset?)p.CreatedAt),
                db.SavedPlans.Where(p => p.RunnerId == r.Id).Max(p => (DateTimeOffset?)p.CreatedAt),
                MaxDay(
                    db.SessionCheckIns.Where(c => c.Status != CheckInStatus.Skipped && db.SavedPlans.Any(p => p.Id == c.SavedPlanId && p.RunnerId == r.Id)).Max(c => (DateOnly?)c.Date),
                    db.Activities.Where(a => a.RunnerId == r.Id && a.Source == ActivitySource.Upload).Max(a => (DateOnly?)a.LocalDate)),
                r.Email != null && r.Email != "",
                r.UpdateEmailsOffAt == null,
                db.Activities.Any(a => a.RunnerId == r.Id && a.Source == ActivitySource.Strava && a.CachedUntil > now),
                db.ProviderConnections.Any(c => c.RunnerId == r.Id && c.Status == ConnectionStatus.NeedsReconnect))));

    private static DateOnly? MaxDay(DateOnly? a, DateOnly? b) => a is null ? b : b is null ? a : a > b ? a : b;

    private sealed record Claimed(Guid Id, int Attempts);

    private sealed record FactsRow(Guid Id, string? Email, string DisplayName, OnboardingFacts Facts);

    // Only the delivery's own id and the campaign: never the runner, their address or their name.
    [LoggerMessage(Level = LogLevel.Warning, Message = "Onboarding email {DeliveryId} ({Campaign}) failed on attempt {Attempt}.")]
    private static partial void LogFailed(ILogger logger, Guid deliveryId, OnboardingCampaign campaign, int attempt, Exception exception);
}
