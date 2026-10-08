using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Plans;

namespace StartLine.API.Controllers;

[ApiController]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/plans")]
public sealed class PlansController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>
    /// Builds a week-by-week plan. Nothing is stored: the same inputs always give the same plan,
    /// which is what lets the client share a plan as a link.
    /// </summary>
    [HttpPost]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<TrainingPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Generate([FromBody] GeneratePlanQuery request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(request, cancellationToken));
}
