using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Common.Behaviours;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;

namespace StartLine.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        var assembly = typeof(DependencyInjection).Assembly;

        services.AddScoped<IDispatcher, Dispatcher>();
        foreach (var type in assembly.GetTypes().Where(t => t is { IsAbstract: false, IsInterface: false }))
        {
            foreach (var handlerInterface in type.GetInterfaces()
                .Where(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IRequestHandler<,>)))
            {
                services.AddScoped(handlerInterface, type);
            }
        }

        services.AddSingleton<RaceCalendarSync>();
        services.AddScoped<PlanBuilder>();
        services.AddScoped<CurrentRunner>();
        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);
        services.AddScoped(typeof(IPipelineBehaviour<,>), typeof(ValidationBehaviour<,>));
        return services;
    }
}
