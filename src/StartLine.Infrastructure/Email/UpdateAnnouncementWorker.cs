using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Insights;

namespace StartLine.Infrastructure.Email;

/// <summary>
/// The switches for a "what's new" announcement (docs/email.md). Everything is off by default: nothing goes to runners
/// until <see cref="Campaign"/>, <see cref="AccountsCreatedBefore"/> and <see cref="Enabled"/> are all set in App Service,
/// after the preview has been checked.
/// </summary>
internal sealed class UpdateAnnouncementOptions
{
    public const string Section = "UpdateAnnouncement";

    /// <summary>Which announcement, for example "redesign-2026-11". Empty means none.</summary>
    public string Campaign { get; set; } = "";

    /// <summary>Set it, and the app sends one preview of the announcement there when it starts; clear it again after.</summary>
    public string TestTo { get; set; } = "";

    /// <summary>Sends the announcement to runners who said yes to news and updates. Off until a preview has been checked.</summary>
    public bool Enabled { get; set; }

    /// <summary>Only accounts created before this get it (the release time): someone who joins later shouldn't hear it's new.</summary>
    public DateTimeOffset? AccountsCreatedBefore { get; set; }

    /// <summary>How often the worker sends the next batch.</summary>
    public TimeSpan Every { get; set; } = TimeSpan.FromMinutes(30);

    public int MaxPerRun { get; set; } = AnnouncementBudget.Default.MaxPerRun;

    /// <summary>At most this many announcements in any 24 hours.</summary>
    public int DailyLimit { get; set; } = AnnouncementBudget.Default.DailyLimit;

    /// <summary>Every email Taperday sends in 24 hours stays under this (Brevo's free plan: 300 a day). The recap comes first.</summary>
    public int DailyEmailBudget { get; set; } = AnnouncementBudget.Default.DailyEmailBudget;

    public AnnouncementBudget Budget => new(MaxPerRun, DailyLimit, DailyEmailBudget);
}

/// <summary>
/// Every <see cref="UpdateAnnouncementOptions.Every"/>, sends the next batch of the announcement within the day's budget
/// (<see cref="IUpdateAnnouncements"/>), until everyone due it has it. Without a Brevo key, or while the switches are
/// off, nothing goes to runners. Logs carry counts only.
/// </summary>
internal sealed partial class UpdateAnnouncementWorker(
    IServiceScopeFactory scopes,
    IEmailSender email,
    IOptions<UpdateAnnouncementOptions> options,
    TimeProvider time,
    ILogger<UpdateAnnouncementWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        if (string.IsNullOrWhiteSpace(settings.Campaign))
        {
            return;
        }

        if (!IUpdateAnnouncements.Campaigns.Contains(settings.Campaign))
        {
            LogUnknownCampaign(logger, settings.Campaign);
            return;
        }

        if (!email.Configured)
        {
            LogNotConfigured(logger);
            return;
        }

        if (settings.TestTo is { Length: > 0 } test)
        {
            await PreviewAsync(settings.Campaign, test, stoppingToken);
        }

        if (!settings.Enabled)
        {
            LogOff(logger, settings.Campaign);
            return;
        }

        if (settings.AccountsCreatedBefore is not { } before)
        {
            LogNoCutoff(logger, settings.Campaign);
            return;
        }

        var every = settings.Every > TimeSpan.Zero ? settings.Every : TimeSpan.FromMinutes(30);
        while (!stoppingToken.IsCancellationRequested)
        {
            await SendDueAsync(settings.Campaign, before, settings.Budget, stoppingToken);
            await Task.Delay(every, time, stoppingToken);
        }
    }

    private async Task SendDueAsync(string campaign, DateTimeOffset before, AnnouncementBudget budget, CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var run = await scope.ServiceProvider.GetRequiredService<IUpdateAnnouncements>().SendDueAsync(campaign, before, time.GetUtcNow(), budget, cancellationToken);
            if (run.Sent > 0 || run.Failed > 0)
            {
                LogRun(logger, campaign, run.Sent, run.Failed, run.Allowance);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    // A made-up copy, never a runner's: it carries no one's data, writes no delivery record and has no unsubscribe key.
    private async Task PreviewAsync(string campaign, string to, CancellationToken cancellationToken)
    {
        try
        {
            if (campaign == UpdateEmails.RedesignCampaign)
            {
                await email.SendAsync(UpdateEmails.TaperdayRedesign(to, "Thami", test: true), cancellationToken);
            }

            LogPreviewSent(logger, campaign);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogFailed(logger, e);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Announcement '{Campaign}' isn't one Taperday knows (UpdateAnnouncement:Campaign).")]
    private static partial void LogUnknownCampaign(ILogger logger, string campaign);

    [LoggerMessage(Level = LogLevel.Information, Message = "Announcements not scheduled: no Brevo key (Email:BrevoApiKey).")]
    private static partial void LogNotConfigured(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Announcement '{Campaign}' is off (UpdateAnnouncement:Enabled).")]
    private static partial void LogOff(ILogger logger, string campaign);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Announcement '{Campaign}' needs UpdateAnnouncement:AccountsCreatedBefore (the release time) before it sends.")]
    private static partial void LogNoCutoff(ILogger logger, string campaign);

    [LoggerMessage(Level = LogLevel.Information, Message = "Announcement '{Campaign}' preview sent.")]
    private static partial void LogPreviewSent(ILogger logger, string campaign);

    [LoggerMessage(Level = LogLevel.Information, Message = "Announcement '{Campaign}': {Sent} sent, {Failed} failed (allowance {Allowance}).")]
    private static partial void LogRun(ILogger logger, string campaign, int sent, int failed, int allowance);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Announcement run failed.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}
