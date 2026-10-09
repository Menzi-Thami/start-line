using System.Text;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.API.Calendar;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Plans;

namespace StartLine.API.Controllers;

[ApiController]
[AllowAnonymous]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/plans")]
public sealed class PlansController(IDispatcher dispatcher, TimeProvider timeProvider) : ControllerBase
{
    /// <summary>
    /// Builds a week-by-week plan. Nothing is stored: the same inputs always give the same plan,
    /// which is what lets the client share a plan as a link.
    /// </summary>
    [HttpPost]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [RequestSizeLimit(16 * 1024)]
    [ProducesResponseType<TrainingPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Generate([FromBody] GeneratePlanQuery request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(request, cancellationToken));

    /// <summary>
    /// The same plan as a calendar feed, for Apple Calendar, Google Calendar or Outlook to subscribe to. The plan's
    /// inputs are the query string (lists repeat the key: runDays=Tuesday&amp;runDays=Thursday), so the feed needs no
    /// account or token: calendar apps can't sign in. planFrom should be pinned, as the client always does, or the plan
    /// would shift each time the calendar refreshes.
    /// </summary>
    [HttpGet("calendar.ics")]
    [Produces(PlanCalendar.ContentType)]
    [ProducesResponseType<string>(StatusCodes.Status200OK, PlanCalendar.ContentType)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Calendar(
        [FromQuery] GeneratePlanQuery request,
        [FromQuery] string? units,
        CancellationToken cancellationToken)
    {
        var plan = await dispatcher.Send(request, cancellationToken);

        // Calendar servers poll; let anything in between reuse a copy for an hour.
        Response.Headers.CacheControl = "public, max-age=3600";
        return Content(PlanCalendar.Build(plan, units == "mi", timeProvider.GetUtcNow()), PlanCalendar.ContentType, Encoding.UTF8);
    }
}
