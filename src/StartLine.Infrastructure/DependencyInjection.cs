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
        services.AddSingleton<IRaceCatalogue, ConfiguredRaceCatalogue>();

        return services;
    }
}
