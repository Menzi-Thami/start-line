using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Journey;

namespace StartLine.API.Controllers;

/// <summary>
/// The runner's journey: each plan as a chapter (training recap, race result, badges), recovery after a race and easy
/// running after it. Another runner's ids are "not found".
/// </summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/journey")]
public sealed class MyJourneyController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>Every chapter, the recovery going on and easy running. Badges are brought up to date on every read.</summary>
    [HttpGet]
    [ProducesResponseType<JourneyDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new GetMyJourneyQuery(), cancellationToken));
    }

    /// <summary>One plan's chapter, week by week.</summary>
    [HttpGet("plans/{planId:guid}")]
    [ProducesResponseType<PlanChapterDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Chapter(Guid planId, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new GetMyPlanChapterQuery(planId), cancellationToken));
    }

    /// <summary>The badge's celebration has played, so it won't play again on any device. Idempotent.</summary>
    [HttpPost("achievements/{id:guid}/celebrated")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Celebrated(Guid id, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new CelebrateAchievementCommand(id), cancellationToken);
        return NoContent();
    }

    /// <summary>Records or corrects the plan's race result. One per plan.</summary>
    [HttpPut("plans/{planId:guid}/race-result")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<RaceResultDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SaveRaceResult(Guid planId, SaveRaceResultRequest result, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new SaveRaceResultCommand(planId, result), cancellationToken));

    /// <summary>Takes the race result back (an undo); the finisher badge goes with it.</summary>
    [HttpDelete("plans/{planId:guid}/race-result")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteRaceResult(Guid planId, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteRaceResultCommand(planId), cancellationToken);
        return NoContent();
    }

    /// <summary>Starts recovery after a race the runner ran. 201 when started, 200 when the same recovery already existed.</summary>
    [HttpPost("recovery")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<RecoveryPlanDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<RecoveryPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> StartRecovery(StartRecoveryRequest recovery, CancellationToken cancellationToken)
    {
        var started = await dispatcher.Send(new StartRecoveryCommand(recovery), cancellationToken);
        return started.Created ? StatusCode(StatusCodes.Status201Created, started.Recovery) : Ok(started.Recovery);
    }

    /// <summary>Pause, resume, extend, finish, end early, restart or change a recovery.</summary>
    [HttpPatch("recovery/{id:guid}")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<RecoveryPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ChangeRecovery(Guid id, ChangeRecoveryRequest change, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ChangeRecoveryCommand(id, change), cancellationToken));

    /// <summary>How the runner feels on a day (today by default). One per day; a second answer replaces the first.</summary>
    [HttpPost("recovery/{id:guid}/check-ins")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<RecoveryPlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RecoveryCheckIn(Guid id, RecoveryCheckInRequest checkIn, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new RecoveryCheckInCommand(id, checkIn), cancellationToken));

    /// <summary>Starts easy running, or changes the easy running already going.</summary>
    [HttpPost("maintenance")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<MaintenancePlanDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> StartMaintenance(StartMaintenanceRequest maintenance, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new StartMaintenanceCommand(maintenance), cancellationToken));

    /// <summary>Stops easy running.</summary>
    [HttpDelete("maintenance")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> EndMaintenance(CancellationToken cancellationToken)
    {
        await dispatcher.Send(new EndMaintenanceCommand(), cancellationToken);
        return NoContent();
    }
}
