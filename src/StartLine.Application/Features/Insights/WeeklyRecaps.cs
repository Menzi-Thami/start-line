using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Insights;

/// <summary>What one runner's recap says: last week's running, how the plan went, and the week ahead.</summary>
public sealed record WeeklyRecapContent(
    string DisplayName,
    DateOnly WeekStart,
    int Runs,
    double Km,
    int RunsWithoutDistance,
    int? SessionsPlanned,
    int? SessionsDone,
    IReadOnlyList<(DateOnly Date, string Title, double Km)> NextWeek,
    string? RaceName,
    int? DaysToRace);

/// <summary>
/// The weekly recap email, in Taperday's look (<see cref="EmailLayout"/>): figures only, no claims the numbers don't
/// support. Every runner's copy carries a link that stops the recap and nothing else.
/// </summary>
public static class WeeklyRecap
{
    private static readonly CultureInfo En = CultureInfo.GetCultureInfo("en-GB");

    public static EmailMessage Compose(string to, WeeklyRecapContent recap, UnsubscribeLinks? unsubscribe, bool test = false)
    {
        ArgumentNullException.ThrowIfNull(recap);
        var name = string.IsNullOrWhiteSpace(recap.DisplayName) ? "there" : recap.DisplayName.Trim();
        var span = $"{recap.WeekStart.ToString("d MMM", En)} – {recap.WeekStart.AddDays(6).ToString("d MMM", En)}";
        var km = Km(recap.Km);
        var title = recap.Runs == 0 ? "A quiet week." : $"{km} km over {Plural(recap.Runs, "run")}.";
        var intro = recap.Runs == 0
            ? "No runs logged last week. That's fine: your plan is ready when you are."
            : "Here's what you logged last week, and what's next.";

        List<(string, string)> figures = [("Runs", recap.Runs.ToString(En)), ("Distance", $"{km} km")];
        if (recap is { SessionsPlanned: > 0, SessionsDone: { } done })
        {
            figures.Add(("Planned sessions", $"{done} of {recap.SessionsPlanned}"));
        }

        var body = new StringBuilder();
        body.Append(EmailLayout.Paragraph($"Hi {name}. {intro}", muted: true));
        body.Append(EmailLayout.Figures([.. figures]));
        if (recap.RunsWithoutDistance > 0)
        {
            body.Append(EmailLayout.Paragraph($"{Plural(recap.RunsWithoutDistance, "run")} counted without a distance: ticked off with none given.", muted: true));
        }

        if (recap.NextWeek.Count > 0)
        {
            body.Append(EmailLayout.Heading("The week ahead"));
            foreach (var (date, sessionTitle, sessionKm) in recap.NextWeek)
            {
                body.Append(EmailLayout.Item($"{date.ToString("ddd d MMM", En)} · {sessionTitle}", sessionKm > 0 ? $"{Km(sessionKm)} km" : ""));
            }
        }

        if (recap is { RaceName: { } race, DaysToRace: >= 0 and var days })
        {
            body.Append(EmailLayout.Paragraph(days == 0 ? $"{race} is today. Good luck." : $"{race} is in {Plural(days, "day")}.", muted: true));
        }

        var html = EmailLayout.Wrap(
            preheader: recap.Runs == 0 ? "Your Taperday week, and what's next." : $"Your Taperday week: {km} km over {Plural(recap.Runs, "run")}.",
            kicker: $"Your running week · {span}",
            title: title,
            body: body.ToString(),
            buttonText: "Open this week",
            buttonUrl: EmailLayout.Site,
            footer: "You're getting this because you turned on the weekly recap in Taperday.",
            unsubscribeUrl: unsubscribe?.Page.AbsoluteUri);

        var text = new StringBuilder($"Hi {name}.\n\nYour running week, {span}: {Plural(recap.Runs, "run")}, {km} km.");
        if (recap is { SessionsPlanned: > 0, SessionsDone: { } ran })
        {
            text.Append(En, $" {ran} of {recap.SessionsPlanned} planned sessions.");
        }

        text.Append('\n');
        if (recap.NextWeek.Count > 0)
        {
            text.Append("\nThe week ahead:\n");
            foreach (var (date, sessionTitle, sessionKm) in recap.NextWeek)
            {
                text.Append(En, $"- {date.ToString("ddd d MMM", En)}: {sessionTitle}{(sessionKm > 0 ? $", {Km(sessionKm)} km" : "")}\n");
            }
        }

        text.Append($"\n{EmailLayout.Site}\n");
        if (unsubscribe is not null)
        {
            text.Append("\nStop the weekly recap: ").Append(unsubscribe.Page.AbsoluteUri).Append('\n');
        }

        return new EmailMessage(to, (test ? "[Test] " : "") + "Your Taperday week", html, text.ToString(), unsubscribe);
    }

    /// <summary>A made-up week for a preview to the maker: never another runner's data.</summary>
    public static EmailMessage Preview(string to, DateOnly monday) => Compose(to, new WeeklyRecapContent(
        "Runner", monday.AddDays(-7), 4, 32.5, 0, 5, 4,
        [(monday, "Easy run", 6), (monday.AddDays(2), "Intervals", 8), (monday.AddDays(4), "Easy run", 6), (monday.AddDays(6), "Long run", 16)],
        "Sample 10K", 41), unsubscribe: null, test: true);

    private static string Km(double km) => Math.Round(km, 1).ToString("0.#", En);

    private static string Plural(int count, string one) => $"{count} {(count == 1 ? one : one + "s")}";
}

/// <summary>Sends the weekly recaps due now (see <see cref="WeeklyRecapSender"/>). The hosted worker calls it on a timer.</summary>
public interface IWeeklyRecaps
{
    Task<int> SendDueAsync(DateTimeOffset now, CancellationToken cancellationToken);
}

/// <summary>
/// Sends the weekly recap to every runner who turned it on, at 07:00 on their own Monday, about the week before. Each
/// runner and week is claimed in <see cref="WeeklyRecapDelivery"/> first, so it's sent once however often this runs or
/// however many app instances run it. A Monday the app missed entirely is skipped, never sent late on Tuesday.
/// </summary>
internal sealed partial class WeeklyRecapSender(
    IApplicationDbContext db,
    RunningLogReader reader,
    PlanBuilder builder,
    IEmailSender email,
    IUnsubscribeTokens tokens,
    IEmailSettings settings,
    ILogger<WeeklyRecapSender> logger) : IWeeklyRecaps
{
    public const int SendHour = 7;

    /// <summary>The Monday of the week to recap for this runner now, or null when it isn't their Monday morning yet.</summary>
    public static DateOnly? WeekDue(Runner runner, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(runner);
        var local = TimeZoneInfo.ConvertTime(now, TimeProviderExtensions.ZoneOf(runner.TimeZone));
        return local.DayOfWeek == DayOfWeek.Monday && local.Hour >= SendHour
            ? DateOnly.FromDateTime(local.Date).AddDays(-7)
            : null;
    }

    public async Task<int> SendDueAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var runners = await db.Runners.AsNoTracking()
            .Where(r => r.WeeklyEmails && r.Email != null && r.Email != "")
            .ToListAsync(cancellationToken);
        var sent = 0;
        foreach (var runner in runners)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (WeekDue(runner, now) is not { } week || await ClaimAsync(runner.Id, week, now, cancellationToken) is not { } claim)
            {
                continue;
            }

            try
            {
                var content = await ContentAsync(runner, week, cancellationToken);
                var links = UnsubscribeLinks.For(tokens.Issue(runner.Id, EmailList.Weekly), settings.ApiBaseUrl, weekly: true);
                await email.SendAsync(WeeklyRecap.Compose(runner.Email!, content, links), cancellationToken);
                claim.Sent(now);
                sent++;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                claim.Failed();
                LogFailed(logger, runner.Id, claim.Attempts, e);
            }

            await db.SaveChangesAsync(cancellationToken);
        }

        return sent;
    }

    /// <summary>This runner's delivery for the week, claimed for sending now; null when it's sent, being sent, or given up.</summary>
    private async Task<WeeklyRecapDelivery?> ClaimAsync(Guid runnerId, DateOnly week, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var existing = await db.WeeklyRecapDeliveries.AsNoTracking().SingleOrDefaultAsync(d => d.RunnerId == runnerId && d.WeekStart == week, cancellationToken);
        if (existing is not null)
        {
            if (!existing.CanRetry)
            {
                return null;
            }

            // Another instance may be retrying the same row: only the one whose update finds it still Failed goes ahead.
            var attempts = existing.Attempts;
            var claimed = await db.WeeklyRecapDeliveries
                .Where(d => d.Id == existing.Id && d.Status == RecapDeliveryStatus.Failed && d.Attempts == attempts)
                .ExecuteUpdateAsync(s => s.SetProperty(d => d.Status, RecapDeliveryStatus.Sending).SetProperty(d => d.Attempts, attempts + 1), cancellationToken);
            if (claimed == 0)
            {
                return null;
            }

            // Tracked as it now stands (Sending), so a second failure is saved as one.
            return await db.WeeklyRecapDeliveries.SingleAsync(d => d.Id == existing.Id, cancellationToken);
        }

        var claim = WeeklyRecapDelivery.Claim(runnerId, week, now);
        db.WeeklyRecapDeliveries.Add(claim);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return claim;
        }
        catch (DbUpdateException)
        {
            // Another instance claimed it first (one row per runner and week).
            db.WeeklyRecapDeliveries.Remove(claim);
            return null;
        }
    }

    private async Task<WeeklyRecapContent> ContentAsync(Runner runner, DateOnly week, CancellationToken cancellationToken)
    {
        var end = week.AddDays(6);
        // Strava runs count while Taperday holds them, as on Home; nothing about them is stored.
        var logged = await reader.ReadAsync(runner, week, end, includeSynced: true, cancellationToken);
        var saved = await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runner.Id && p.Status == SavedPlanStatus.Active)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        int? planned = null, done = null;
        List<(DateOnly, string, double)> next = [];
        string? race = null;
        int? daysToRace = null;
        if (saved is not null)
        {
            try
            {
                var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
                var monday = week.AddDays(7);
                var plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved.Inputs), calls, saved.Adjustments, monday);
                var sessions = plan.Weeks.SelectMany(w => w.Sessions).ToList();
                var lastWeek = sessions.Where(s => s.Date >= week && s.Date <= end && SessionCheckIn.IsCheckable(s.Type) && s.Type != SessionType.Race).ToList();
                if (lastWeek.Count > 0)
                {
                    var checkIns = await db.SessionCheckIns.AsNoTracking()
                        .Where(c => c.SavedPlanId == saved.Id && c.Date >= week && c.Date <= end && !c.IsAdditional)
                        .ToListAsync(cancellationToken);
                    var uploads = await db.Activities.AsNoTracking()
                        .Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.LocalDate >= week && a.LocalDate <= end)
                        .ToListAsync(cancellationToken);
                    planned = lastWeek.Count;
                    done = lastWeek.Count(s => checkIns.FirstOrDefault(c => c.Date == s.Date && c.SessionType == s.Type) is { } c
                        ? c.Status != CheckInStatus.Skipped
                        : uploads.Any(a => a.LocalDate == s.Date && a.PlannedSession?.SessionType == s.Type));
                }

                next = [.. sessions.Where(s => s.Date >= monday && s.Date < monday.AddDays(7)).Select(s => (s.Date, s.Title, s.DistanceKm))];
                if (plan.RaceDate >= monday)
                {
                    race = saved.Name;
                    daysToRace = plan.RaceDate.DayNumber - monday.DayNumber;
                }
            }
            catch (Exception e) when (e is NotFoundException or DomainException)
            {
                // A plan that can't be built any more (its race left the calendar) still leaves the running figures.
            }
        }

        return new(runner.DisplayName, week, logged.Count, logged.Sum(r => r.DistanceKm), logged.Count(r => r.DistanceUnreported), planned, done, next, race, daysToRace);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Weekly recap failed for runner {RunnerId} (attempt {Attempt}).")]
    private static partial void LogFailed(ILogger logger, Guid runnerId, int attempt, Exception exception);
}
