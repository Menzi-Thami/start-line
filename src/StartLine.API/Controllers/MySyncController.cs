using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Sync;

namespace StartLine.API.Controllers;

/// <summary>The signed-in runner's Strava connection: connect, check, catch up and disconnect.</summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/sync/strava")]
public sealed class MySyncController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<StravaStatusDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Status(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new GetStravaStatusQuery(), cancellationToken));

    /// <summary>The Strava page to send the runner to. 409 <c>strava_unavailable</c> until the Strava app is configured.</summary>
    [HttpPost("authorize")]
    [ProducesResponseType<StravaConnectDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Authorize(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new StartStravaConnectQuery(), cancellationToken));

    /// <summary>Finishes connecting with the <c>code</c>, <c>state</c> and <c>scope</c> Strava sent back, then starts the backfill.</summary>
    [HttpPost]
    [ProducesResponseType<StravaStatusDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Connect([FromBody] ConnectStravaCommand request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(request, cancellationToken));

    /// <summary>Asks Strava for anything missed while the app slept. Cheap to call on every plan open: it runs at most every 10 minutes.</summary>
    [HttpPost("catch-up")]
    [ProducesResponseType<StravaStatusDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> CatchUp(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new CatchUpStravaCommand(), cancellationToken));

    /// <summary>Revokes Taperday at Strava and deletes every synced run. The response confirms what was deleted.</summary>
    [HttpDelete]
    [ProducesResponseType<StravaDisconnectedDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Disconnect(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new DisconnectStravaCommand(), cancellationToken));
}
