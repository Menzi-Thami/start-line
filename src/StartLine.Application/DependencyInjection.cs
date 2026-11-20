using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StartLine.Application.Common.Behaviours;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.Insights;
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
        services.AddScoped<Features.AiCoach.SessionAdjustments>();
        services.AddScoped<Features.AiCoach.TrainingEvidence>();
        services.AddScoped<Features.AiCoach.AiBudget>();
        // Off, with no model, unless Infrastructure registers the configured ones.
        services.TryAddSingleton(new Features.AiCoach.AiCoachSettings());
        services.TryAddTransient<Features.AiCoach.ICoachLanguageModel, Features.AiCoach.NoCoachLanguageModel>();
        services.AddScoped<CurrentRunner>();
        services.AddScoped<HeartRateData>();
        services.AddScoped<PersonalBests>();
        services.AddScoped<ActivityImporter>();
        services.AddScoped<RunningLogReader>();
        services.AddScoped<Features.Insights.IWeeklyRecaps, Features.Insights.WeeklyRecapSender>();
        services.AddScoped<Features.Onboarding.IOnboardingReminders, Features.Onboarding.OnboardingReminderSender>();
        services.AddScoped<Features.CoachingTips.ICoachingTips, Features.CoachingTips.CoachingTipSender>();
        services.AddScoped<Features.Insights.IUpdateAnnouncements, Features.Insights.UpdateAnnouncementSender>();
        services.AddScoped<Features.Shoes.ShoeMileage>();
        services.AddScoped<Features.Shoes.ShoeKeeper>();
        services.AddScoped<Features.Journey.JourneyReader>();
        services.AddScoped<Features.Journey.RaceHistoryReader>();
        services.AddScoped<Features.MyPlans.TrainingLifecycle>();
        services.AddSingleton<StravaRateGate>();
        services.AddScoped<StravaTokens>();
        services.AddScoped<IStravaSync, StravaSyncRunner>();
        services.AddScoped<IReminderRunner, ReminderRunner>();
        services.AddScoped<RunCelebrator>();
        services.AddScoped<NotificationDeliverer>();
        services.AddScoped<NotificationReview>();
        services.AddScoped<AdditionalNotifications>();
        services.AddScoped<UpdateBroadcast>();
        services.AddValidatorsFromAssembly(assembly, includeInternalTypes: true);
        services.AddScoped(typeof(IPipelineBehaviour<,>), typeof(ValidationBehaviour<,>));
        return services;
    }
}
