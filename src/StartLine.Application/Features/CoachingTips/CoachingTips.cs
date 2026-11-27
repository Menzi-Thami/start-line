using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Beginner;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.Insights;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.CoachingTips;

/// <summary>What happened to one runner's tip on one attempt.</summary>
public enum CoachingTipOutcome
{
    /// <summary>Not their Thursday sending hour, weekly emails off, no address, or no such runner.</summary>
    NotDue,

    /// <summary>Already sent this Thursday, being sent elsewhere, left by a crash mid-send, or given up after <see cref="OnboardingDelivery.MaxAttempts"/>.</summary>
    AlreadyHandled,

    /// <summary>Due when claimed, not when re-checked just before sending (weekly emails turned off, say): nothing was sent.</summary>
    Suppressed,

    Sent,

    /// <summary>The send failed; tried again on a later check that hour, up to <see cref="OnboardingDelivery.MaxAttempts"/> in all.</summary>
    Failed,
}

/// <summary>One check of the worker, in counts only (nothing about anyone).</summary>
public sealed record CoachingTipRun(int Sent, int Failed, int HeldBack);

/// <summary>
/// The tips' share of the day's email budget (Brevo's free plan sends 300 a day). The weekly recap comes first and is never
/// held back; the tips take what's left of <see cref="DailyEmailBudget"/> after every email of the last 24 hours; the
/// onboarding nudges come after both.
/// </summary>
public sealed record CoachingTipBudget(int DailyEmailBudget)
{
    public static readonly CoachingTipBudget Default = new(DailyEmailBudget: 250);

    public int Allowance(int emailsLastDay) => Math.Max(0, DailyEmailBudget - emailsLastDay);
}

/// <summary>Sends the coaching tips due now (see <see cref="CoachingTipSender"/>). The hosted worker calls it on a timer.</summary>
public interface ICoachingTips
{
    /// <summary>Sends every tip due this hour, within <paramref name="budget"/>.</summary>
    Task<CoachingTipRun> SendDueAsync(DateTimeOffset now, CoachingTipBudget budget, CancellationToken cancellationToken);

    /// <summary>Decides, claims, re-checks and sends for one runner: the unit of work <see cref="SendDueAsync"/> repeats.</summary>
    Task<CoachingTipOutcome> SendToAsync(Guid runnerId, DateTimeOffset now, CancellationToken cancellationToken);
}

/// <summary>
/// The weekly coaching tip (docs/coaching-tips.md): one email per runner on their own Thursday, 07:00–07:59, for runners with
/// weekly emails on and an address. Each runner and Thursday is claimed in <see cref="OnboardingDelivery"/> (campaign
/// <see cref="OnboardingCampaign.CoachingTip"/>, episode the Thursday) before sending, so it goes once however often this
/// runs or however many instances run it. An hour the app missed entirely is skipped, never sent late.
/// </summary>
internal sealed partial class CoachingTipSender(
    IApplicationDbContext db,
    RunningLogReader reader,
    PlanBuilder builder,
    IEmailSender email,
    IUnsubscribeTokens tokens,
    IEmailSettings settings,
    ILogger<CoachingTipSender> logger) : ICoachingTips
{
    /// <summary>The runner-local Thursday morning sending hour, 07:00–07:59.</summary>
    public const int SendHour = 7;

    private const string EpisodeFormat = "yyyy-MM-dd";

    private static readonly TimeSpan Day = TimeSpan.FromDays(1);

    /// <summary>The runner's Thursday, during its 07:00 hour on their own clock; otherwise null.</summary>
    public static DateOnly? ThursdayDue(Runner runner, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(runner);
        var local = TimeZoneInfo.ConvertTime(now, TimeProviderExtensions.ZoneOf(runner.TimeZone));
        return local.DayOfWeek == DayOfWeek.Thursday && local.Hour == SendHour ? DateOnly.FromDateTime(local.Date) : null;
    }

    public async Task<CoachingTipRun> SendDueAsync(DateTimeOffset now, CoachingTipBudget budget, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(budget);
        var due = (await db.Runners.AsNoTracking()
                .Where(r => r.WeeklyEmails && r.Email != null && r.Email != "")
                .ToListAsync(cancellationToken))
            .Select(r => (r.Id, Thursday: ThursdayDue(r, now)))
            .Where(r => r.Thursday is not null)
            .Select(r => (r.Id, Episode: Episode(r.Thursday!.Value)))
            .ToList();
        if (due.Count == 0)
        {
            return new(0, 0, 0);
        }

        // Only runners whose tip this Thursday is still open (never claimed, or failed and worth another go).
        var ids = due.Select(d => d.Id).ToList();
        var episodes = due.Select(d => d.Episode).Distinct().ToList();
        var claimed = (await db.OnboardingDeliveries.AsNoTracking()
                .Where(d => d.Campaign == OnboardingCampaign.CoachingTip && ids.Contains(d.RunnerId) && episodes.Contains(d.Episode))
                .ToListAsync(cancellationToken))
            .ToDictionary(d => (d.RunnerId, d.Episode));
        var open = due.Where(d => !claimed.TryGetValue((d.Id, d.Episode), out var row) || row.CanRetry).Select(d => d.Id).ToList();

        var allowance = await AllowanceAsync(budget, now, cancellationToken);
        int sent = 0, failed = 0, heldBack = 0;
        foreach (var runnerId in open)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (sent + failed >= allowance)
            {
                heldBack++;
                continue;
            }

            try
            {
                switch (await SendToAsync(runnerId, now, cancellationToken))
                {
                    case CoachingTipOutcome.Sent:
                        sent++;
                        break;
                    case CoachingTipOutcome.Failed:
                        failed++;
                        break;
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // Choosing one runner's tip went wrong before anything was claimed: the rest still get theirs, and this
                // runner is tried again on the next check this hour.
                failed++;
                LogChoiceFailed(logger, e);
            }
        }

        return new(sent, failed, heldBack);
    }

    public async Task<CoachingTipOutcome> SendToAsync(Guid runnerId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var runner = await db.Runners.AsNoTracking().SingleOrDefaultAsync(r => r.Id == runnerId, cancellationToken);
        if (runner is null || !Wants(runner) || ThursdayDue(runner, now) is not { } thursday)
        {
            return CoachingTipOutcome.NotDue;
        }

        var episode = Episode(thursday);
        var past = await db.OnboardingDeliveries.AsNoTracking()
            .Where(d => d.RunnerId == runnerId && d.Campaign == OnboardingCampaign.CoachingTip)
            .ToListAsync(cancellationToken);
        var own = past.FirstOrDefault(d => d.Episode == episode);
        if (own is not null && !own.CanRetry)
        {
            return CoachingTipOutcome.AlreadyHandled;
        }

        var history = past
            .Where(d => d.Episode != episode && d.MayHaveGone && d.TipKey is not null)
            .Select(d => DateOnly.TryParseExact(d.Episode, EpisodeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) ? new PastCoachingTip(day, d.TipKey!) : null)
            .OfType<PastCoachingTip>()
            .ToList();
        var facts = await FactsAsync(runner, thursday, now, cancellationToken);
        var choice = CoachingTipSelector.Choose(facts, history);

        // The personal note about Strava-held easy runs: worked out here, put in this email, and stored nowhere. The claim
        // below records the main tip's key only.
        var note = CoachingTipSelector.StravaEasyNote(facts, choice);

        if (await ClaimAsync(runnerId, episode, choice.Tip.Key, own, now, cancellationToken) is not { } claim)
        {
            return CoachingTipOutcome.AlreadyHandled;
        }

        // Read again, immediately before sending: weekly emails turned off, the address removed or the account deleted
        // since the first read means no email.
        var fresh = await db.Runners.AsNoTracking().SingleOrDefaultAsync(r => r.Id == runnerId, cancellationToken);
        if (fresh is null || !Wants(fresh))
        {
            await LetGoAsync(claim, cancellationToken);
            return CoachingTipOutcome.Suppressed;
        }

        try
        {
            var links = UnsubscribeLinks.For(tokens.Issue(runnerId, EmailList.Weekly), settings.ApiBaseUrl, weekly: true);
            await email.SendAsync(CoachingTipEmail.Compose(fresh.Email!, choice.Tip, thursday, fresh.DisplayName, links, note: note), cancellationToken);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            await FinishAsync(claim, OnboardingDeliveryStatus.Failed, null, cancellationToken);
            LogFailed(logger, claim.Id, claim.Attempts, e);
            return CoachingTipOutcome.Failed;
        }

        await FinishAsync(claim, OnboardingDeliveryStatus.Sent, now, cancellationToken);
        return CoachingTipOutcome.Sent;
    }

    private static string Episode(DateOnly thursday) => thursday.ToString(EpisodeFormat, CultureInfo.InvariantCulture);

    private static bool Wants(Runner runner) => runner.WeeklyEmails && !string.IsNullOrWhiteSpace(runner.Email);

    /// <summary>
    /// What the rules need, read now (<see cref="RunningLogReader"/>). The long-run jump uses kept runs only; whether the
    /// runner ran last week also counts the Strava runs held right now, as Home does. The current plan gives the race day
    /// and whether it had running sessions last week.
    /// </summary>
    private async Task<CoachingTipFacts> FactsAsync(Runner runner, DateOnly thursday, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var yesterday = thursday.AddDays(-1);
        var weekFrom = thursday.AddDays(-7);
        var monthFrom = weekFrom.AddDays(-30);
        // The long-run jump is judged on kept runs only (uploads and ticks): which tip went out is stored, and nothing
        // worked out from Strava may be. Held Strava runs only stop a "quiet week" tip going to someone who did run.
        var kept = await reader.ReadAsync(runner, monthFrom, yesterday, includeSynced: false, cancellationToken);
        var lastWeek = await reader.ReadAsync(runner, weekFrom, yesterday, includeSynced: true, cancellationToken);

        var saved = await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        DateOnly? race = saved?.Inputs.RaceDate;
        var planned = false;
        IReadOnlyList<EasyRunPace> easyRuns = [];
        IReadOnlyList<EasyRunPace> heldEasyRuns = [];
        PaceRange? easyPaces = null;
        if (saved is not null)
        {
            try
            {
                var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
                var plan = builder.BuildPlan(saved, calls, saved.Adjustments, thursday);
                race = plan.RaceDate;
                // Sessions from before the plan was made were never the runner's to run.
                var made = DateOnly.FromDateTime(saved.CreatedAt.UtcDateTime);
                planned = plan.Weeks.SelectMany(w => w.Sessions).Any(s =>
                    s.Date >= weekFrom && s.Date <= yesterday && s.Date >= made && SessionCheckIn.IsCheckable(s.Type));
                if (plan.Paces.TryGetValue(PaceZone.Easy, out var easy))
                {
                    easyPaces = easy;
                    (easyRuns, heldEasyRuns) = await EasyRunsAsync(runner, saved.Id, [.. plan.Weeks.SelectMany(w => w.Sessions)], weekFrom, yesterday, now, cancellationToken);
                }
            }
            catch (Exception e) when (e is NotFoundException or DomainException)
            {
                // A plan that can't be built any more (its race left the calendar) still has its saved race day.
            }
        }

        var track = CoachingTipSelector.TrackFor(saved?.Inputs.Experience, InCouchTo5K(runner));
        return new(thursday, race, track,
            Longest(kept, weekFrom, yesterday),
            Longest(kept, monthFrom, weekFrom.AddDays(-1)),
            planned,
            lastWeek.Count > 0,
            easyRuns,
            easyPaces,
            runner.Units,
            heldEasyRuns);
    }

    /// <summary>
    /// Last week's kept runs on days the plan had an easy session (Easy, Recovery, EasyWithStrides), with their pace: the
    /// runner's uploads, and their check-ins on the current plan that give both a distance and a time. Strava runs never
    /// count as kept, so nothing stored is decided from them. A check-in linked to an upload counts once, as the upload. On a day of
    /// easy running with strides an upload's pace is the median of its full kilometres, so the strides don't make it look fast.
    /// </summary>
    /// <remarks>
    /// <c>Held</c> is the separate, read-only view for the personal note: the Strava runs Taperday holds right now
    /// (<c>CachedUntil</c> after <paramref name="now"/>, the 7-day cache) on the same easy days. A held run that's also an
    /// upload (the same start or <see cref="RunMatch.IsSameRun(Activity, Activity)"/>), or that a counted check-in carries
    /// the runner's own figures for, is left out: it counts once, as the kept run. Nothing worked out from them is stored.
    /// </remarks>
    private async Task<(IReadOnlyList<EasyRunPace> Kept, IReadOnlyList<EasyRunPace> Held)> EasyRunsAsync(
        Runner runner, Guid planId, IReadOnlyList<PlannedSession> sessions, DateOnly from, DateOnly to, DateTimeOffset now, CancellationToken cancellationToken)
    {
        // Each easy day, and whether its easy session is the one with strides.
        var easyDays = sessions
            .Where(s => s.Date >= from && s.Date <= to && s.Type is SessionType.Easy or SessionType.Recovery or SessionType.EasyWithStrides)
            .GroupBy(s => s.Date)
            .ToDictionary(g => g.Key, g => g.All(s => s.Type == SessionType.EasyWithStrides));
        if (easyDays.Count == 0)
        {
            return ([], []);
        }

        var recorded = await db.Activities.AsNoTracking().Visible(now)
            .Where(a => a.RunnerId == runner.Id && a.Kind != ActivityKind.Other && a.LocalDate >= from && a.LocalDate <= to
                && (a.Source == ActivitySource.Upload || (a.Source == ActivitySource.Strava && a.CachedUntil > now)))
            .ToListAsync(cancellationToken);
        var uploads = recorded.Where(a => a.Source == ActivitySource.Upload).ToList();
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == planId && c.Date >= from && c.Date <= to && c.Status != CheckInStatus.Skipped)
            .ToListAsync(cancellationToken);

        EasyRunPace? Paced(Activity run) => easyDays.TryGetValue(run.LocalDate, out var strides) && run.DistanceMetres > 0 && run.MovingTime > TimeSpan.Zero
            ? new(strides && run.Splits.Where(s => s.IsFullKilometre).Select(s => s.PaceSecondsPerKm).Order().ToList() is { Count: > 0 } kilometres
                ? kilometres[kilometres.Count / 2]
                : run.PaceSecondsPerKm, run.DistanceKm)
            : null;

        List<EasyRunPace> kept = [.. uploads.Select(Paced).OfType<EasyRunPace>()];
        var uploadIds = uploads.Select(a => a.Id).ToHashSet();
        HashSet<Guid> counted = [];
        foreach (var checkIn in checkIns.Where(c => easyDays.ContainsKey(c.Date) && !(c.ActivityId is { } id && uploadIds.Contains(id))))
        {
            if (checkIn.Answers is { DistanceKm: > 0 and var km, Duration: { } time, DistanceUnreported: false } && time > TimeSpan.Zero)
            {
                kept.Add(new(time.TotalSeconds / km, km));
                if (checkIn.ActivityId is { } linked)
                {
                    counted.Add(linked);
                }
            }
        }

        List<EasyRunPace> held = [.. recorded
            .Where(a => a.Source == ActivitySource.Strava && !counted.Contains(a.Id)
                && !uploads.Any(u => u.StartedAt == a.StartedAt || RunMatch.IsSameRun(u, a)))
            .Select(Paced)
            .OfType<EasyRunPace>()];
        return (kept, held);
    }

    private static double? Longest(IReadOnlyList<LoggedRun> runs, DateOnly from, DateOnly to) => runs
        .Where(r => r.Date >= from && r.Date <= to && !r.DistanceUnreported && r.DistanceKm > 0)
        .Select(r => (double?)r.DistanceKm)
        .Max();

    // A Couch to 5K programme still under way (its 27 runs not all done) makes a new runner, whatever plan sits beside it.
    private static bool InCouchTo5K(Runner runner)
    {
        if (string.IsNullOrWhiteSpace(runner.BeginnerProgressJson))
        {
            return false;
        }

        try
        {
            return JsonSerializer.Deserialize<BeginnerProgressState>(runner.BeginnerProgressJson) is { } progress && (progress.Completed?.Count ?? 0) < 27;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>Every email of the last 24 hours (sent or mid-send) counts against the day's budget.</summary>
    private async Task<int> AllowanceAsync(CoachingTipBudget budget, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var since = now - Day;
        var onboardingAndTips = await db.OnboardingDeliveries.CountAsync(
            d => (d.Status == OnboardingDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == OnboardingDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        var recaps = await db.WeeklyRecapDeliveries.CountAsync(
            d => (d.Status == RecapDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == RecapDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        var announcements = await db.AnnouncementDeliveries.CountAsync(
            d => (d.Status == AnnouncementDeliveryStatus.Sent && d.SentAt > since && d.SentAt <= now) || (d.Status == AnnouncementDeliveryStatus.Sending && d.ClaimedAt > since && d.ClaimedAt <= now),
            cancellationToken);
        return budget.Allowance(onboardingAndTips + recaps + announcements);
    }

    /// <summary>This runner's tip for the Thursday, claimed for sending now; null when another instance has it.</summary>
    private async Task<Claimed?> ClaimAsync(Guid runnerId, string episode, string tipKey, OnboardingDelivery? existing, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (existing is not null)
        {
            // A retry. Another instance may be retrying the same row: only the one whose update finds it still Failed goes
            // ahead. The tip is chosen afresh, so the row names the one that's actually sent.
            var attempts = existing.Attempts;
            var claimed = await db.OnboardingDeliveries
                .Where(d => d.Id == existing.Id && d.Status == OnboardingDeliveryStatus.Failed && d.Attempts == attempts)
                .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, OnboardingDeliveryStatus.Sending).SetProperty(d => d.Attempts, attempts + 1).SetProperty(d => d.TipKey, tipKey), cancellationToken);
            return claimed == 0 ? null : new Claimed(existing.Id, attempts + 1, existing.TipKey);
        }

        var claim = OnboardingDelivery.Claim(runnerId, OnboardingCampaign.CoachingTip, episode, now, tipKey);
        db.OnboardingDeliveries.Add(claim);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return new Claimed(claim.Id, claim.Attempts, null);
        }
        catch (DbUpdateException)
        {
            // Another instance claimed it first (one row per runner, campaign and Thursday), or the account has just gone.
            db.OnboardingDeliveries.Remove(claim);
            return null;
        }
    }

    // After the claim, every step is a single-row update, so an account deleted mid-send leaves nothing half-saved behind.
    private Task<int> FinishAsync(Claimed claim, OnboardingDeliveryStatus status, DateTimeOffset? sentAt, CancellationToken cancellationToken) =>
        db.OnboardingDeliveries
            .Where(d => d.Id == claim.Id && d.Status == OnboardingDeliveryStatus.Sending)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, status).SetProperty(d => d.SentAt, sentAt), cancellationToken);

    // Nothing was sent: a first claim is removed; a retry goes back to Failed, this attempt not counted, naming the tip it had.
    private Task<int> LetGoAsync(Claimed claim, CancellationToken cancellationToken) => claim.Attempts <= 1
        ? db.OnboardingDeliveries
            .Where(d => d.Id == claim.Id && d.Status == OnboardingDeliveryStatus.Sending)
            .ExecuteDeleteAsync(cancellationToken)
        : db.OnboardingDeliveries
            .Where(d => d.Id == claim.Id && d.Status == OnboardingDeliveryStatus.Sending)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, OnboardingDeliveryStatus.Failed).SetProperty(d => d.Attempts, claim.Attempts - 1).SetProperty(d => d.TipKey, claim.PreviousTipKey), cancellationToken);

    private sealed record Claimed(Guid Id, int Attempts, string? PreviousTipKey);

    // Only the delivery's own id: never the runner, their address, their name or their running.
    [LoggerMessage(Level = LogLevel.Warning, Message = "Coaching tip {DeliveryId} failed on attempt {Attempt}.")]
    private static partial void LogFailed(ILogger logger, Guid deliveryId, int attempt, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Choosing a coaching tip failed for one runner; tried again on the next check.")]
    private static partial void LogChoiceFailed(ILogger logger, Exception exception);
}
