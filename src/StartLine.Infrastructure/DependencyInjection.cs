using Azure.Identity;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StartLine.Application.Common;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Races;
using StartLine.Application.Features.Sync;
using StartLine.Infrastructure.Activities;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Races;
using StartLine.Infrastructure.Sync;

namespace StartLine.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Set to a Key Vault key URI in Azure to wrap the Data Protection key ring. Required wherever Strava is on outside development.</summary>
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

        services.AddSingleton<IActivityFileReader, FitActivityFileReader>();

        services.AddOptions<DatabaseOptions>()
            .Configure<IConfiguration>((o, config) => o.ConnectionString = config.GetConnectionString(DatabaseOptions.ConnectionStringName) ?? "")
            .Validate(o => !string.IsNullOrWhiteSpace(o.ConnectionString), $"ConnectionStrings:{DatabaseOptions.ConnectionStringName} is required.")
            .ValidateOnStart();
        services.AddSingleton<AuditTimestampsInterceptor>();
        services.AddDbContext<StartLineDbContext>((sp, o) =>
        {
            var database = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            // Retries cover Azure SQL's transient faults, including the free tier waking from auto-pause.
            o.UseSqlServer(database.ConnectionString, sql => sql.EnableRetryOnFailure());
            o.AddInterceptors(sp.GetRequiredService<AuditTimestampsInterceptor>());
        });
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<StartLineDbContext>());
        services.AddHealthChecks().AddDbContextCheck<StartLineDbContext>("database", tags: ["ready"]);

        AddStravaSync(services, configuration);

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
}
