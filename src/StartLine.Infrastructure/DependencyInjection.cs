using Azure.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StartLine.Application.Common;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.Insights;
using StartLine.Application.Features.Notifications;
using StartLine.Application.Features.Races;
using StartLine.Application.Features.Sync;
using StartLine.Infrastructure.Activities;
using StartLine.Infrastructure.Email;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Push;
using StartLine.Infrastructure.Races;
using StartLine.Infrastructure.Sync;

namespace StartLine.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Set to a Key Vault key URI in Azure to wrap the Data Protection key ring. Required wherever Strava or reminders are on outside development.</summary>
    public const string KeyVaultKeySetting = "DataProtection:KeyVaultKeyUri";

    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        services.AddSingleton(TimeProvider.System);

        services.AddOptions<RaceCatalogueOptions>()
            .BindConfiguration(RaceCatalogueOptions.Section)
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<RaceCatalogueOptions>, RaceCatalogueOptionsValidator>();
        services.AddOptions<RaceCalendarOptions>()
            .BindConfiguration(RaceCalendarOptions.Section)
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<RaceCalendarOptions>, RaceCalendarOptionsValidator>();

        // One store behind two narrow interfaces: readers can't write, the sync can't be asked for races.
        services.AddSingleton<InMemoryRaceStore>();
        services.AddSingleton<IRaceCatalogue>(sp => sp.GetRequiredService<InMemoryRaceStore>());
        services.AddSingleton<IRaceStore>(sp => sp.GetRequiredService<InMemoryRaceStore>());

        // Race sources. Each new source (organiser feed, federation calendar) is one more line here.
        services.AddSingleton<IRaceSource, ConfiguredRaceSource>();

        services.AddHostedService<RaceSyncWorker>();

        services.AddSingleton<IActivityFileReader, ActivityFileReader>();

        services.AddOptions<DatabaseOptions>()
            .Configure<IConfiguration>((o, config) => o.ConnectionString = config.GetConnectionString(DatabaseOptions.ConnectionStringName) ?? "")
            .Validate(o => !string.IsNullOrWhiteSpace(o.ConnectionString), $"ConnectionStrings:{DatabaseOptions.ConnectionStringName} is required.")
            .ValidateOnStart();
        services.AddSingleton<AuditTimestampsInterceptor>();
        services.AddSingleton<ReminderScheduleInterceptor>();
        services.AddDbContext<StartLineDbContext>((sp, o) =>
        {
            var database = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            // Retries cover Azure SQL's transient faults, including the free tier waking from auto-pause.
            o.UseSqlServer(database.ConnectionString, sql => sql.EnableRetryOnFailure());
            o.AddInterceptors(sp.GetRequiredService<AuditTimestampsInterceptor>(), sp.GetRequiredService<ReminderScheduleInterceptor>());
        });
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<StartLineDbContext>());
        services.AddHealthChecks().AddDbContextCheck<StartLineDbContext>("database", tags: ["ready"]);

        AddStravaSync(services, configuration);
        AddReminders(services);

        return services;
    }

    private static void AddStravaSync(IServiceCollection services, IConfiguration configuration)
    {
        var protection = services.AddDataProtection()
            .SetApplicationName("Taperday")
            .PersistKeysToDbContext<StartLineDbContext>();
        if (configuration[KeyVaultKeySetting] is { Length: > 0 } keyUri)
        {
            // The API's managed identity needs "Key Vault Crypto User" on the key (see infra/main.bicep).
            protection.ProtectKeysWithAzureKeyVault(new Uri(keyUri), new DefaultAzureCredential());
        }

        services.AddOptions<StravaOptions>().BindConfiguration(StravaOptions.Section).ValidateOnStart();
        services.AddSingleton<IValidateOptions<StravaOptions>, StravaOptionsValidator>();
        services.AddSingleton<IStravaSettings, StravaSettings>();
        services.AddSingleton<ITokenProtector, DataProtectionTokenProtector>();
        services.AddSingleton<IConnectState, DataProtectionConnectState>();
        services.AddSingleton<SyncSignal>();
        services.AddSingleton<ISyncSignal>(sp => sp.GetRequiredService<SyncSignal>());
        services.AddHttpClient<IStravaApi, HttpStravaApi>((sp, http) =>
            http.Timeout = sp.GetRequiredService<IOptions<StravaOptions>>().Value.Timeout);
        services.AddHostedService<StravaSyncWorker>();
    }

    private static void AddReminders(IServiceCollection services)
    {
        // Uses the Data Protection key ring set up with Strava sync above, under its own purpose.
        services.AddOptions<PushOptions>().BindConfiguration(PushOptions.Section).ValidateOnStart();
        services.AddSingleton<IValidateOptions<PushOptions>, PushOptionsValidator>();
        services.AddSingleton<IPushSettings, PushSettings>();
        services.AddSingleton<IPushAddressProtector, DataProtectionPushAddressProtector>();
        services.AddSingleton<ITickTokens, DataProtectionTickTokens>();
        services.AddSingleton<ReminderSignal>();
        services.AddTransient<MarkPushRequests>();
        // No request logging: the URL is a device's push endpoint, a secret (PushTraces keeps it out of traces too).
        services.AddHttpClient<IPushSender, WebPushSender>((sp, http) =>
                http.Timeout = sp.GetRequiredService<IOptions<PushOptions>>().Value.Timeout)
            .AddHttpMessageHandler<MarkPushRequests>()
            .RemoveAllLoggers();
        services.AddHostedService<ReminderWorker>();
        services.AddOptions<EmailOptions>().BindConfiguration(EmailOptions.Section);
        services.AddSingleton<IEmailSettings, EmailSettings>();
        // Same key ring again, under its own purpose; an unsubscribe key never expires (docs/email.md).
        services.AddSingleton<IUnsubscribeTokens, DataProtectionUnsubscribeTokens>();
        services.AddOptions<ReportOptions>().BindConfiguration(ReportOptions.Section);
        // No request logging: the Brevo key travels in a header.
        services.AddHttpClient<IEmailSender, BrevoEmailSender>(http => http.Timeout = TimeSpan.FromSeconds(30)).RemoveAllLoggers();
        services.AddOptions<RunnerWeeklyRecapOptions>().BindConfiguration(RunnerWeeklyRecapOptions.Section);
        services.AddHostedService<RunnerWeeklyRecapWorker>();
        services.AddOptions<PushTestOptions>().BindConfiguration("PushTest").ValidateOnStart();
        services.AddSingleton<IValidateOptions<PushTestOptions>, PushTestOptionsValidator>();
        services.AddScoped<PushTestRunner>();
        services.AddHostedService<PushTestWorker>();
    }
}
