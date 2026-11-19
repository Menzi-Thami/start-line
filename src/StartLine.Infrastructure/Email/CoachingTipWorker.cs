using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.CoachingTips;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure.Email;

/// <summary>
/// The coaching tips' switches (docs/coaching-tips.md). Off by default: nothing goes to runners until <see cref="Enabled"/>
/// is set in App Service, after the previews have been checked.
/// </summary>
internal sealed class CoachingTipOptions
{
    public const string Section = "CoachingTips";

    /// <summary>Sends each runner with weekly emails on a tip on their own Thursday morning. Off until a preview has been checked.</summary>
    public bool Enabled { get; set; }

    /// <summary>Set it, and the app sends made-up previews there when it starts (one per track and the long-run jump); clear it again after.</summary>
    public string TestTo { get; set; } = "";

    /// <summary>Every email Taperday sends in 24 hours stays under this (Brevo's free plan: 300 a day). The recap comes first.</summary>
    public int DailyEmailBudget { get; set; } = CoachingTipBudget.Default.DailyEmailBudget;
}

/// <summary>
/// Every 15 minutes, sends the coaching tips that are due (<see cref="ICoachingTips"/>): 07:00–07:59 on each runner's own
/// Thursday. Without a Brevo key, or while <see cref="CoachingTipOptions.Enabled"/> is off, nothing goes to runners. Logs
/// carry counts only.
/// </summary>
internal sealed partial class CoachingTipWorker(
    IServiceScopeFactory scopes,
    IEmailSender email,
    IOptions<CoachingTipOptions> options,
    TimeProvider time,
    ILogger<CoachingTipWorker> logger)
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

        if (!options.Value.Enabled)
        {
            LogOff(logger);
            return;
        }

        var budget = new CoachingTipBudget(options.Value.DailyEmailBudget);
        while (!stoppingToken.IsCancellationRequested)
        {
            await SendDueAsync(budget, stoppingToken);
            await Task.Delay(Every, time, stoppingToken);
        }
    }

    private async Task SendDueAsync(CoachingTipBudget budget, CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var run = await scope.ServiceProvider.GetRequiredService<ICoachingTips>().SendDueAsync(time.GetUtcNow(), budget, cancellationToken);
            if (run.Sent > 0 || run.Failed > 0 || run.HeldBack > 0)
            {
                LogRun(logger, run.Sent, run.Failed, run.HeldBack);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    // Made-up copies, never a runner's: the previews go to whoever is set, so they carry no one's data, write no delivery
    // records and have no unsubscribe key.
    private async Task PreviewAsync(string to, CancellationToken cancellationToken)
    {
        try
        {
            var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
            var thursday = today.AddDays(((int)DayOfWeek.Thursday - (int)today.DayOfWeek + 7) % 7);
            foreach (var preview in CoachingTipEmail.Previews(to, thursday))
            {
                await email.SendAsync(preview, cancellationToken);
            }

            LogPreviewSent(logger);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Coaching tips not scheduled: no Brevo key (Email:BrevoApiKey).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Coaching tips are off (CoachingTips:Enabled).")]
    private static partial void LogOff(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Coaching tips: {Sent} sent, {Failed} failed, {HeldBack} held back by the daily email budget.")]
    private static partial void LogRun(ILogger logger, int sent, int failed, int heldBack);

    [LoggerMessage(Level = LogLevel.Information, Message = "Coaching tip previews sent.")]
    private static partial void LogPreviewSent(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Coaching tip run failed.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}
