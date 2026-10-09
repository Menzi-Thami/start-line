using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Races;
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
        return services;
    }
}
