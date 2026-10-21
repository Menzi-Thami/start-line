using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.CheckIns;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;

namespace StartLine.API.Controllers;

/// <summary>How each planned run went, in the runner's words: what the coach adjusts the plan from.</summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/plans/{planId:guid}/check-ins")]
public sealed class MyCheckInsController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CheckInDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid planId, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ListCheckInsQuery(planId), cancellationToken));

    /// <summary>Saves the check-in for the run planned on <c>date</c> of type <c>sessionType</c>, replacing any earlier one.</summary>
    [HttpPut("{date}/{sessionType}")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<CheckInDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Save(Guid planId, DateOnly date, SessionType sessionType, [FromBody] CheckInRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return Ok(await dispatcher.Send(
            new SaveCheckInCommand(planId, date, sessionType, request.Status, request.Effort, request.Pain, request.PainArea, request.DistanceKm, request.Duration, request.Note),
            cancellationToken));
    }

    [HttpDelete("{date}/{sessionType}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid planId, DateOnly date, SessionType sessionType, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteCheckInCommand(planId, date, sessionType), cancellationToken);
        return NoContent();
    }
}

/// <param name="Effort">1 (very easy) to 10 (all out). Required unless the run was skipped.</param>
/// <param name="DistanceKm">For a run no watch or app recorded.</param>
public sealed record CheckInRequest(
    CheckInStatus Status,
    int? Effort,
    PainLevel Pain = PainLevel.None,
    BodyArea? PainArea = null,
    double? DistanceKm = null,
    TimeSpan? Duration = null,
    string? Note = null);
