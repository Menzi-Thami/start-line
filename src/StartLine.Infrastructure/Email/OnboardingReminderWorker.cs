using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Insights;
using StartLine.Application.Features.Onboarding;
using StartLine.Domain.Runners;

namespace StartLine.Infrastructure.Email;

/// <summary>
/// The onboarding emails' switches (docs/onboarding-reminders.md). Off by default: nothing goes to runners until
/// <see cref="Enabled"/> is set in App Service, after the previews have been checked.
/// </summary>
internal sealed class OnboardingReminderOptions
{
    public const string Section = "OnboardingReminder";

    /// <summary>Sends the onboarding emails to runners who are due one. Off until a preview has been checked.</summary>
    public bool Enabled { get; set; }

    /// <summary>Set it, and the app sends one made-up preview of each email there when it starts; clear it again after.</summary>
    public string TestTo { get; set; } = "";

    /// <summary>How often the worker looks for runners due an email.</summary>
    public TimeSpan Every { get; set; } = TimeSpan.FromMinutes(30);

    /// <summary>At most this many per run, so older signups trickle out rather than all at once.</summary>
    public int MaxPerRun { get; set; } = OnboardingBudget.Default.MaxPerRun;

    /// <summary>At most this many onboarding emails in any 24 hours.</summary>
    public int DailyLimit { get; set; } = OnboardingBudget.Default.DailyLimit;

    /// <summary>Every email Taperday sends in 24 hours stays under this (Brevo's free plan: 300 a day). The recap comes first.</summary>
    public int DailyEmailBudget { get; set; } = OnboardingBudget.Default.DailyEmailBudget;

    public OnboardingBudget Budget => new(MaxPerRun, DailyLimit, DailyEmailBudget);
}

/// <summary>
/// Every <see cref="OnboardingReminderOptions.Every"/>, sends the onboarding emails that are due
/// (<see cref="IOnboardingReminders"/>), within the day's budget. Without a Brevo key, or while
/// <see cref="OnboardingReminderOptions.Enabled"/> is off, nothing goes to runners. Logs carry counts only.
/// </summary>
internal sealed partial class OnboardingReminderWorker(
    IServiceScopeFactory scopes,
    IEmailSender email,
    IOptions<OnboardingReminderOptions> options,
    TimeProvider time,
    ILogger<OnboardingReminderWorker> logger)
    : BackgroundService
{
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

        var every = options.Value.Every > TimeSpan.Zero ? options.Value.Every : TimeSpan.FromMinutes(30);
        while (!stoppingToken.IsCancellationRequested)
        {
            await SendDueAsync(stoppingToken);
            await Task.Delay(every, time, stoppingToken);
        }
    }

    private async Task SendDueAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var run = await scope.ServiceProvider.GetRequiredService<IOnboardingReminders>().SendDueAsync(time.GetUtcNow(), options.Value.Budget, cancellationToken);
            if (run.Sent > 0 || run.Failed > 0)
            {
                LogRun(logger, run.Sent, run.Failed, run.Allowance);
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
            foreach (var campaign in Enum.GetValues<OnboardingCampaign>())
            {
                await email.SendAsync(OnboardingEmail.Preview(to, campaign), cancellationToken);
            }

            LogPreviewSent(logger);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Onboarding emails not scheduled: no Brevo key (Email:BrevoApiKey).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Onboarding emails are off (OnboardingReminder:Enabled).")]
    private static partial void LogOff(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Onboarding emails: {Sent} sent, {Failed} failed (allowance {Allowance}).")]
    private static partial void LogRun(ILogger logger, int sent, int failed, int allowance);

    [LoggerMessage(Level = LogLevel.Information, Message = "Onboarding email previews sent.")]
    private static partial void LogPreviewSent(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Onboarding email run failed.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}
