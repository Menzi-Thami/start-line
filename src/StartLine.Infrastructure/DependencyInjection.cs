using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StartLine.Application.Common;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Races;
using StartLine.Infrastructure.Activities;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Races;

namespace StartLine.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
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

        return services;
    }
}
