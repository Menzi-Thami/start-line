using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure.Email;

/// <summary>The weekly recap's switches. Both default off: nothing is sent until they're set in App Service.</summary>
internal sealed class RunnerWeeklyRecapOptions
{
    public const string Section = "RunnerWeeklyRecap";

    /// <summary>Sends the recap to runners who turned it on. Off until a preview has been checked.</summary>
    public bool Enabled { get; set; }

    /// <summary>Set it, and the app sends one made-up preview there when it starts; clear it again after.</summary>
    public string TestTo { get; set; } = "";
}

/// <summary>
/// Every 15 minutes, sends the weekly recaps that are due (<see cref="IWeeklyRecaps"/>): 19:00 on each runner's own
/// Sunday. It replaces the maker's Monday report. Without a Brevo key, or while <see cref="RunnerWeeklyRecapOptions.Enabled"/>
/// is off, nothing goes to runners.
/// </summary>
internal sealed partial class RunnerWeeklyRecapWorker(
    IServiceScopeFactory scopes,
    IEmailSender email,
    IOptions<RunnerWeeklyRecapOptions> options,
    TimeProvider time,
    ILogger<RunnerWeeklyRecapWorker> logger)
    : BackgroundService
{
    public static readonly TimeSpan Every = TimeSpan.FromMinutes(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!email.Configured)
        {
            LogNotConfigured(logger);
            return;
        }

        if (options.Value.TestTo is { Length: > 0 } test)
        {
            await PreviewAsync(test, stoppingToken);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            if (options.Value.Enabled)
            {
                await SendDueAsync(stoppingToken);
            }

            await Task.Delay(Every, time, stoppingToken);
        }
    }

    private async Task SendDueAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var sent = await scope.ServiceProvider.GetRequiredService<IWeeklyRecaps>().SendDueAsync(time.GetUtcNow(), cancellationToken);
            if (sent > 0)
            {
                LogSent(logger, sent);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    // A made-up week, never a runner's: the preview goes to whoever is set, so it carries no one's data.
    private async Task PreviewAsync(string to, CancellationToken cancellationToken)
    {
        try
        {
            var monday = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
            monday = monday.AddDays(-(((int)monday.DayOfWeek + 6) % 7));
            await email.SendAsync(WeeklyRecap.Preview(to, monday), cancellationToken);
            LogPreviewSent(logger);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Weekly recap not scheduled: no Brevo key (Email:BrevoApiKey).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Weekly recap sent to {Count} runners.")]
    private static partial void LogSent(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Information, Message = "Weekly recap preview sent.")]
    private static partial void LogPreviewSent(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Weekly recap run failed.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}
