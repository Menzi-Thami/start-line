using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StartLine.Application.Common;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure.Email;

/// <summary>
/// The Monday report: at 07:00 South African time each Monday it counts how Taperday is doing and emails the maker. It
/// touches the database only then (and for a test send at start, when <see cref="ReportOptions.SendTestTo"/> is set).
/// Without a Brevo key it does nothing. A Monday the app was down at 07:00 is skipped, not sent late.
/// </summary>
internal sealed partial class WeeklyReportWorker(
    IServiceScopeFactory scopes,
    IEmailSender email,
    IOptions<ReportOptions> options,
    TimeProvider time,
    ILogger<WeeklyReportWorker> logger)
    : BackgroundService
{
    private static readonly TimeZoneInfo Zone = TimeZoneInfo.FindSystemTimeZoneById("Africa/Johannesburg");

    /// <summary>The next Monday 07:00 in South Africa after now.</summary>
    public static DateTimeOffset NextSend(DateTimeOffset now)
    {
        var local = TimeZoneInfo.ConvertTime(now, Zone);
        var days = ((int)DayOfWeek.Monday - (int)local.DayOfWeek + 7) % 7;
        var at = new DateTimeOffset(local.Date.AddDays(days).AddHours(7), local.Offset);
        return at > now ? at : at.AddDays(7);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!email.Configured)
        {
            LogNotConfigured(logger);
            return;
        }

        if (options.Value.SendTestTo is { Length: > 0 } test)
        {
            await SendAsync(test, isTest: true, stoppingToken);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var wait = NextSend(time.GetUtcNow()) - time.GetUtcNow();
            await Task.Delay(wait > TimeSpan.Zero ? wait : TimeSpan.Zero, time, stoppingToken);
            await SendAsync(options.Value.To, isTest: false, stoppingToken);
        }
    }

    private async Task SendAsync(string to, bool isTest, CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
            var now = time.GetUtcNow();
            var counts = await WeeklyReport.CountAsync(db, now, cancellationToken);
            await email.SendAsync(WeeklyReport.Compose(counts, to, DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, Zone).Date), isTest), cancellationToken);
            LogSent(logger, isTest);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Weekly report not scheduled: no Brevo key (Email:BrevoApiKey).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Weekly report sent (test: {IsTest}).")]
    private static partial void LogSent(ILogger logger, bool isTest);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Weekly report failed to send.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}
