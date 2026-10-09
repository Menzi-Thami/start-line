using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.MyPlans;

namespace StartLine.API.Controllers;

[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/plans")]
public sealed class MyPlansController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<SavedPlanSummaryDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ListMyPlansQuery(), cancellationToken));

    [HttpPost]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<SavedPlanSummaryDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Save([FromBody] SavePlanCommand request, CancellationToken cancellationToken)
    {
        var saved = await dispatcher.Send(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = saved.Id, version = "1" }, saved);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType<SavedPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new GetMyPlanQuery(id), cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteMyPlanCommand(id), cancellationToken);
        return NoContent();
    }
}
