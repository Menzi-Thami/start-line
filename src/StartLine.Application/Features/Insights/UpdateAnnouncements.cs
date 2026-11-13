using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Features.Account;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Insights;

/// <summary>How many announcements may go: per run, per day, and within everything Taperday sends in a day.</summary>
public sealed record AnnouncementBudget(int MaxPerRun, int DailyLimit, int DailyEmailBudget)
{
    /// <summary>Brevo's free plan sends 300 a day; the weekly recap and onboarding emails share it, and the recap comes first.</summary>
    public static readonly AnnouncementBudget Default = new(MaxPerRun: 25, DailyLimit: 200, DailyEmailBudget: 250);

    public int Allowance(int announcementsLastDay, int otherEmailsLastDay, int recapReserve)
    {
        var left = Math.Min(DailyLimit - announcementsLastDay, DailyEmailBudget - announcementsLastDay - otherEmailsLastDay - recapReserve);
        return Math.Max(0, Math.Min(MaxPerRun, left));
    }
}

public sealed record AnnouncementRun(int Allowance, int Sent, int Failed);

public enum AnnouncementOutcome { Sent, Failed, NotDue, AlreadyHandled, Suppressed }

/// <summary>Sends a "what's new" announcement to the runners who said yes to news and updates (docs/email.md).</summary>
public interface IUpdateAnnouncements
{
    /// <summary>The announcements Taperday can send, by campaign name.</summary>
    static IReadOnlyCollection<string> Campaigns => [.. UpdateAnnouncementSender.Composers.Keys];

    /// <summary>
    /// Sends <paramref name="campaign"/> to as many runners still due it as the budget allows. Only accounts created before
    /// <paramref name="accountsCreatedBefore"/> get it: someone who joins after a launch shouldn't hear it's new.
    /// </summary>
    Task<AnnouncementRun> SendDueAsync(string campaign, DateTimeOffset accountsCreatedBefore, DateTimeOffset now, AnnouncementBudget budget, CancellationToken cancellationToken);

    /// <summary>Claims, re-checks and sends for one runner: the unit of work <see cref="SendDueAsync"/> repeats.</summary>
    Task<AnnouncementOutcome> SendToAsync(string campaign, Guid runnerId, DateTimeOffset accountsCreatedBefore, DateTimeOffset now, CancellationToken cancellationToken);
}

/// <summary>
/// Each runner and campaign is claimed in <see cref="AnnouncementDelivery"/> before sending, so it goes once however often
/// this runs or however many instances run it. The runner is read again after the claim, immediately before sending, and
/// updates turned off (or the account deleted) since lets the claim go without sending. Nothing is logged about runners.
/// </summary>
internal sealed partial class UpdateAnnouncementSender(
    IApplicationDbContext db,
    IEmailSender email,
    IUnsubscribeTokens tokens,
    IEmailSettings settings,
    ILogger<UpdateAnnouncementSender> logger) : IUpdateAnnouncements
{
    private static readonly TimeSpan Day = TimeSpan.FromDays(1);

    internal static readonly IReadOnlyDictionary<string, Func<string, string, UnsubscribeLinks, EmailMessage>> Composers =
        new Dictionary<string, Func<string, string, UnsubscribeLinks, EmailMessage>>(StringComparer.Ordinal)
        {
            [UpdateEmails.RedesignCampaign] = (to, name, links) => UpdateEmails.TaperdayRedesign(to, name, unsubscribe: links),
            [UpdateEmails.SignInOutageCampaign] = (to, name, links) => UpdateEmails.SignInOutage(to, name, unsubscribe: links),
        };

    public async Task<AnnouncementRun> SendDueAsync(string campaign, DateTimeOffset accountsCreatedBefore, DateTimeOffset now, AnnouncementBudget budget, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(budget);
        if (!Composers.ContainsKey(campaign))
        {
            throw new ArgumentException($"No announcement called '{campaign}'.", nameof(campaign));
        }

        var allowance = await AllowanceAsync(budget, now, cancellationToken);
        if (allowance == 0)
        {
            return new(0, 0, 0);
        }

        // Oldest accounts first; anyone already sent, mid-send or out of retries is left out.
        var queue = await Eligible(db.Runners, accountsCreatedBefore)
            .Where(r => !db.AnnouncementDeliveries.Any(d => d.RunnerId == r.Id && d.Campaign == campaign
                && (d.Status != AnnouncementDeliveryStatus.Failed || d.Attempts >= AnnouncementDelivery.MaxAttempts)))
            .OrderBy(r => r.CreatedAt)
            .Select(r => r.Id)
            .Take(allowance * 4)
            .ToListAsync(cancellationToken);

        int sent = 0, failed = 0;
        foreach (var runnerId in queue)
        {
            if (sent + failed >= allowance)
            {
                break;
            }

            cancellationToken.ThrowIfCancellationRequested();
            switch (await SendToAsync(campaign, runnerId, accountsCreatedBefore, now, cancellationToken))
            {
                case AnnouncementOutcome.Sent:
                    sent++;
                    break;
                case AnnouncementOutcome.Failed:
                    failed++;
                    break;
            }
        }

        return new(allowance, sent, failed);
    }

    public async Task<AnnouncementOutcome> SendToAsync(string campaign, Guid runnerId, DateTimeOffset accountsCreatedBefore, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!Composers.TryGetValue(campaign, out var compose))
        {
            throw new ArgumentException($"No announcement called '{campaign}'.", nameof(campaign));
        }

        if (!await Eligible(db.Runners, accountsCreatedBefore).AnyAsync(r => r.Id == runnerId, cancellationToken))
        {
            return AnnouncementOutcome.NotDue;
        }

        if (await ClaimAsync(runnerId, campaign, now, cancellationToken) is not { } claim)
        {
            return AnnouncementOutcome.AlreadyHandled;
        }

        // Read again, immediately before sending: updates turned off or the account deleted since means no email.
        var fresh = await Eligible(db.Runners, accountsCreatedBefore).Where(r => r.Id == runnerId).Select(r => new { r.Email, r.DisplayName }).SingleOrDefaultAsync(cancellationToken);
        if (fresh is null)
        {
            await LetGoAsync(claim, cancellationToken);
            return AnnouncementOutcome.Suppressed;
        }

        try
        {
            var links = UnsubscribeLinks.For(tokens.Issue(runnerId, EmailList.Updates), settings.ApiBaseUrl);
            await email.SendAsync(compose(fresh.Email!, fresh.DisplayName, links), cancellationToken);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            await FinishAsync(claim, AnnouncementDeliveryStatus.Failed, null, cancellationToken);
            LogFailed(logger, claim.Id, campaign, claim.Attempts, e);
            return AnnouncementOutcome.Failed;
        }

        await FinishAsync(claim, AnnouncementDeliveryStatus.Sent, now, cancellationToken);
        return AnnouncementOutcome.Sent;
    }

    // Only runners with an address who said yes to news and updates (never the weekly-recap setting), whose account
    // predates the announcement.
    private static IQueryable<Runner> Eligible(IQueryable<Runner> runners, DateTimeOffset accountsCreatedBefore) =>
        runners.AsNoTracking().Where(r => r.Email != null && r.Email != "" && r.UpdateEmailsOffAt == null && r.CreatedAt < accountsCreatedBefore);

    /// <summary>
    /// What's left today: every email Taperday sent (or is mid-send) in the last 24 hours counts against it, and every
    /// runner with the weekly recap on is held a place.
    /// </summary>
    private async Task<int> AllowanceAsync(AnnouncementBudget budget, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var since = now - Day;
        var announcements = await db.AnnouncementDeliveries.CountAsync(
            d => (d.Status == AnnouncementDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == AnnouncementDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        var onboarding = await db.OnboardingDeliveries.CountAsync(
            d => (d.Status == OnboardingDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == OnboardingDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        var recaps = await db.WeeklyRecapDeliveries.CountAsync(
            d => (d.Status == RecapDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == RecapDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        var reserve = await db.Runners.CountAsync(r => r.WeeklyEmails && r.Email != null && r.Email != "", cancellationToken);
        return budget.Allowance(announcements, onboarding + recaps, reserve);
    }

    private async Task<Claimed?> ClaimAsync(Guid runnerId, string campaign, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var existing = await db.AnnouncementDeliveries.AsNoTracking().SingleOrDefaultAsync(d => d.RunnerId == runnerId && d.Campaign == campaign, cancellationToken);
        if (existing is not null)
        {
            if (!existing.CanRetry)
            {
                return null;
            }

            // Another instance may be retrying the same row: only the one whose update finds it still Failed goes ahead.
            var attempts = existing.Attempts;
            var claimed = await db.AnnouncementDeliveries
                .Where(d => d.Id == existing.Id && d.Status == AnnouncementDeliveryStatus.Failed && d.Attempts == attempts)
                .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, AnnouncementDeliveryStatus.Sending).SetProperty(d => d.Attempts, attempts + 1), cancellationToken);
            return claimed == 0 ? null : new Claimed(existing.Id, attempts + 1);
        }

        var claim = AnnouncementDelivery.Claim(runnerId, campaign, now);
        db.AnnouncementDeliveries.Add(claim);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return new Claimed(claim.Id, claim.Attempts);
        }
        catch (DbUpdateException)
        {
            // Another instance claimed it first (one row per runner and campaign), or the account has just gone.
            db.AnnouncementDeliveries.Remove(claim);
            return null;
        }
    }

    private Task<int> FinishAsync(Claimed claim, AnnouncementDeliveryStatus status, DateTimeOffset? sentAt, CancellationToken cancellationToken) =>
        db.AnnouncementDeliveries
            .Where(d => d.Id == claim.Id && d.Status == AnnouncementDeliveryStatus.Sending)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, status).SetProperty(d => d.SentAt, sentAt), cancellationToken);

    // Nothing was sent: a first claim is removed, a retry goes back to Failed with this attempt not counted.
    private Task<int> LetGoAsync(Claimed claim, CancellationToken cancellationToken) => claim.Attempts <= 1
        ? db.AnnouncementDeliveries
            .Where(d => d.Id == claim.Id && d.Status == AnnouncementDeliveryStatus.Sending)
            .ExecuteDeleteAsync(cancellationToken)
        : db.AnnouncementDeliveries
            .Where(d => d.Id == claim.Id && d.Status == AnnouncementDeliveryStatus.Sending)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, AnnouncementDeliveryStatus.Failed).SetProperty(d => d.Attempts, claim.Attempts - 1), cancellationToken);

    private sealed record Claimed(Guid Id, int Attempts);

    // Only the delivery's own id and the campaign: never the runner, their address or their name.
    [LoggerMessage(Level = LogLevel.Warning, Message = "Announcement {DeliveryId} ({Campaign}) failed on attempt {Attempt}.")]
    private static partial void LogFailed(ILogger logger, Guid deliveryId, string campaign, int attempt, Exception exception);
}
