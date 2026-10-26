using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.CheckIns;

namespace StartLine.API.Controllers;

/// <summary>
/// The "Tick it" button on a "ran it?" notification. The service worker that shows it can't sign in, so it's anonymous
/// and the key the push carried is the only way in: good for one session of one runner, for a few days. The key travels
/// in the body, never the path, so it's never in a trace.
/// </summary>
[ApiController]
[AllowAnonymous]
[ApiVersion(1)]
[EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
[Route("api/v{version:apiVersion}/ticks")]
public sealed class TicksController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>Ticks the session the key is for as done, unless the runner has already checked in on it.</summary>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Tick([FromBody] TickRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        await dispatcher.Send(new TickFromNotificationCommand(request.Token), cancellationToken);
        return NoContent();
    }
}

/// <param name="Token">The key from the notification.</param>
public sealed record TickRequest(string Token);
