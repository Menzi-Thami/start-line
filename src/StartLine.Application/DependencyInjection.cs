using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Common.Behaviours;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.Notifications;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Application.Features.Sync;

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
        services.AddScoped<PlanCoach>();
        services.AddScoped<CurrentRunner>();
        services.AddScoped<HeartRateData>();
        services.AddScoped<PersonalBests>();
        services.AddScoped<ActivityImporter>();
        services.AddSingleton<StravaRateGate>();
        services.AddScoped<StravaTokens>();
        services.AddScoped<IStravaSync, StravaSyncRunner>();
        services.AddScoped<IReminderRunner, ReminderRunner>();
        services.AddScoped<RunCelebrator>();
        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);
        services.AddScoped(typeof(IPipelineBehaviour<,>), typeof(ValidationBehaviour<,>));
        return services;
    }
}
