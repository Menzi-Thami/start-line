using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Beginner;

namespace StartLine.API.Controllers;

[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/beginner")]
public sealed class BeginnerController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<BeginnerProgressState>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var progress = await dispatcher.Send(new ReadBeginnerProgressQuery(), cancellationToken);
        return progress is null ? NoContent() : Ok(progress);
    }

    [HttpPut]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<BeginnerProgressState>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Save([FromBody] BeginnerProgressState progress, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new SaveBeginnerProgressCommand(progress), cancellationToken));
    }
}
