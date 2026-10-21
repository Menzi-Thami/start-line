using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Domain.Plans;

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

    /// <summary>
    /// Opens the plan with the coach's calls applied. On or after Monday, the coach makes this week's call from how last
    /// week went (check-ins and recorded runs) and keeps it: hold, ease off, step up or run as written.
    /// </summary>
    [HttpPost("{id:guid}/coach")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<SavedPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Coach(Guid id, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new CoachMyPlanCommand(id), cancellationToken));

    /// <summary>Makes a past plan the current one again. The plan that was current becomes a past plan.</summary>
    [HttpPost("{id:guid}/restore")]
    [ProducesResponseType<SavedPlanSummaryDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Restore(Guid id, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new RestoreMyPlanCommand(id), cancellationToken));

    /// <summary>
    /// "Replan from here": rebuilds the current plan from <c>replanFrom</c> after missed training, illness, injury or
    /// running less than planned. The weeks before stay as they were; the race date and goal don't change.
    /// </summary>
    [HttpPost("{id:guid}/replan")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<SavedPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replan(Guid id, [FromBody] ReplanRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return Ok(await dispatcher.Send(new ReplanMyPlanCommand(id, request.ReplanFrom, request.Setback, request.RecentWeeklyKm), cancellationToken));
    }

    /// <summary>Undoes the replan: the plan is back as first built.</summary>
    [HttpDelete("{id:guid}/replan")]
    [ProducesResponseType<SavedPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UndoReplan(Guid id, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ReplanMyPlanCommand(id, null, null, null), cancellationToken));

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteMyPlanCommand(id), cancellationToken);
        return NoContent();
    }
}

/// <param name="ReplanFrom">The runner's local date: the plan is rebuilt from the Monday after it.</param>
/// <param name="RecentWeeklyKm">What the runner ran last week. Required when they're behind.</param>
public sealed record ReplanRequest(DateOnly ReplanFrom, Setback Setback, double? RecentWeeklyKm);
