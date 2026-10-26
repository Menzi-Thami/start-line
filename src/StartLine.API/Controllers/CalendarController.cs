using System.Text;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.API.Calendar;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Calendar;
using StartLine.Domain.Runners;

namespace StartLine.API.Controllers;

/// <summary>
/// A runner's personal calendar feed. Calendar apps can't sign in, so it's anonymous and the unguessable token in the
/// path is the only key; that path is kept out of traces (<see cref="Infrastructure.SecretPaths"/>).
/// </summary>
[ApiController]
[AllowAnonymous]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/calendar")]
public sealed class CalendarController(IDispatcher dispatcher, TimeProvider timeProvider) : ControllerBase
{
    /// <summary>
    /// The runner's current plan as a calendar feed, as the app shows it today: the coach's calls and any replan included,
    /// and a new plan in place of the old one. No current plan is an empty calendar. 404 for a link that's been reset.
    /// </summary>
    [HttpGet("{token}.ics")]
    [Produces(PlanCalendar.ContentType)]
    [ProducesResponseType<string>(StatusCodes.Status200OK, PlanCalendar.ContentType)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Feed(string token, CancellationToken cancellationToken)
    {
        var feed = await dispatcher.Send(new GetCalendarFeedQuery(token), cancellationToken);
        var ics = feed.Plan is null
            ? PlanCalendar.Empty()
            : PlanCalendar.Build(feed.Plan, feed.Units == Units.Miles, timeProvider.GetUtcNow());

        // The same as the plan's own feed: calendar servers poll, so anything in between may reuse a copy for an hour.
        Response.Headers.CacheControl = "public, max-age=3600";
        return Content(ics, PlanCalendar.ContentType, Encoding.UTF8);
    }
}
