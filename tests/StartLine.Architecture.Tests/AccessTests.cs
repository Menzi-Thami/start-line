using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace StartLine.Architecture.Tests;

/// <summary>
/// Who may call what. Every controller is either on the reviewed anonymous list below or needs a signed-in runner with
/// the app's scope. A new anonymous endpoint fails here until someone has checked it exposes no runner's data.
/// </summary>
public sealed class AccessTests
{
    private const string RunnerPolicy = "runner";

    // Reviewed: each serves public or token-keyed data and reads no runner from the caller.
    private static readonly string[] ReviewedAnonymous =
    [
        "CalendarController",      // personal calendar feed, keyed by a secret token (calendar apps can't sign in)
        "PlansController",         // stateless plan generation and its .ics, from the inputs in the request
        "PredictionsController",   // race time predictions from the request alone
        "RacesController",         // the public race catalogue
        "StravaWebhookController", // Strava's own calls, checked by the secret in the path
        "TicksController",         // a notification's Tick it, checked by its signed key
        "UnsubscribeController",   // email unsubscribe, checked by a signed token
    ];

    private static readonly Type[] Controllers = typeof(Program).Assembly.GetTypes()
        .Where(t => !t.IsAbstract && typeof(ControllerBase).IsAssignableFrom(t))
        .ToArray();

    [Fact]
    public void Controllers_are_found() => Controllers.Length.ShouldBeGreaterThan(10);

    [Fact]
    public void Only_reviewed_controllers_allow_anonymous_callers() =>
        Controllers.Where(AllowsAnonymous).Select(t => t.Name).Order().ShouldBe(ReviewedAnonymous.Order());

    [Fact]
    public void Every_other_controller_needs_a_signed_in_runner_with_the_app_scope()
    {
        var open = Controllers.Where(t => !AllowsAnonymous(t))
            .Where(t => t.GetCustomAttributes<AuthorizeAttribute>(inherit: true).All(a => a.Policy != RunnerPolicy))
            .Select(t => t.Name);
        open.ShouldBeEmpty();
    }

    [Fact]
    public void No_action_opens_itself_to_anonymous_callers_inside_a_runner_controller()
    {
        var actions = Controllers.Where(t => !AllowsAnonymous(t))
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => m.GetCustomAttribute<AllowAnonymousAttribute>() is not null)
                .Select(m => $"{t.Name}.{m.Name}"));
        actions.ShouldBeEmpty();
    }

    private static bool AllowsAnonymous(Type controller) => controller.GetCustomAttribute<AllowAnonymousAttribute>(inherit: true) is not null;
}
