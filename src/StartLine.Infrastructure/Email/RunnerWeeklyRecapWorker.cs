using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StartLine.Application.Common;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure.Email;

internal sealed class RunnerWeeklyRecapOptions
{
    public const string Section = "RunnerWeeklyRecap";
    // Opt-in production rollout only after the test has been verified.
    public bool Enabled { get; set; }
    public string TestTo { get; set; } = "";
}

/// <summary>Replaces the maker's Monday operational report. Starts in test-only mode by default.</summary>
internal sealed class RunnerWeeklyRecapWorker(
    IServiceScopeFactory scopes, IEmailSender email, IOptions<RunnerWeeklyRecapOptions> options,
    TimeProvider clock, ILogger<RunnerWeeklyRecapWorker> logger) : BackgroundService
{
    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Africa/Johannesburg");

    internal static DateTimeOffset NextSend(DateTimeOffset now)
    {
        var local = TimeZoneInfo.ConvertTime(now, Zone);
        var days = ((int)DayOfWeek.Monday - (int)local.DayOfWeek + 7) % 7;
        var next = new DateTimeOffset(local.Date.AddDays(days).AddHours(7), local.Offset);
        return next > now ? next : next.AddDays(7);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!email.Configured)
        {
            logger.LogWarning("Runner weekly recap not scheduled: transactional email is not configured.");
            return;
        }

        // Explicit test address only. Never infer a recipient from owner/admin config.
        if (!string.IsNullOrWhiteSpace(options.Value.TestTo))
            await SendTestAsync(options.Value.TestTo, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = NextSend(clock.GetUtcNow()) - clock.GetUtcNow();
            await Task.Delay(delay > TimeSpan.Zero ? delay : TimeSpan.Zero, clock, stoppingToken);
            if (options.Value.Enabled) await SendWeeklyAsync(stoppingToken);
        }
    }

    private async Task SendTestAsync(string recipient, CancellationToken cancellationToken)
    {
        // No real user's sensitive training data is exposed to a test recipient.
        var monday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Zone).Date);
        try
        {
            await email.SendAsync(RunnerWeeklyRecap.Compose(recipient, "Runner", monday.AddDays(-7), 3, 24.5, test: true), cancellationToken);
            logger.LogInformation("Runner recap preview delivered to configured test recipient.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Runner recap preview delivery failed.");
        }
    }

    private async Task SendWeeklyAsync(CancellationToken cancellationToken)
    {
        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Zone).Date);
        var from = localDate.AddDays(-7);
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
        var recipients = await db.Runners.AsNoTracking()
            .Where(r => r.WeeklyEmails && r.Email != null && r.Email != "")
            .Select(r => new { r.Id, r.Email, r.DisplayName }).ToListAsync(cancellationToken);
        foreach (var recipient in recipients)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                // Strava's ephemeral cache may be incomplete: count records currently visible only.
                var records = await db.Activities.AsNoTracking()
                    .Where(a => a.RunnerId == recipient.Id && a.LocalDate >= from && a.LocalDate < localDate
                        && (a.CachedUntil == null || a.CachedUntil > clock.GetUtcNow()))
                    .Select(a => a.DistanceMetres).ToListAsync(cancellationToken);
                var message = RunnerWeeklyRecap.Compose(recipient.Email!, recipient.DisplayName, from,
                    records.Count, records.Sum() / 1000.0, test: false);
                await email.SendAsync(message, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Runner weekly recap failed for runner {RunnerId}", recipient.Id);
            }
        }
    }
}
