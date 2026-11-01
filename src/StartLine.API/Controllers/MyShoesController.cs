using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Shoes;

namespace StartLine.API.Controllers;

/// <summary>The runner's shoes: each pair's distance from the runs worn in it, limits, and which run went in which pair.</summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/shoes")]
public sealed class MyShoesController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ShoeDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        // Distances include synced runs, which may be held only for a short time: never cached anywhere.
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new ListMyShoesQuery(), cancellationToken));
    }

    [HttpPost]
    [ProducesResponseType<ShoeDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(SaveShoeRequest shoe, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, await dispatcher.Send(new CreateShoeCommand(shoe), cancellationToken));

    [HttpPut("{id:guid}")]
    [ProducesResponseType<ShoeDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, SaveShoeRequest shoe, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new UpdateShoeCommand(id, shoe), cancellationToken));

    /// <summary>Deletes a pair. Its runs stay; they're just no longer on any pair.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteShoeCommand(id), cancellationToken);
        return NoContent();
    }

    /// <summary>Puts one run (an upload, a synced run, or a check-in with a distance) on a pair, or takes it off with no pair.</summary>
    [HttpPut("worn")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Wear(WearShoeCommand command, CancellationToken cancellationToken)
    {
        await dispatcher.Send(command, cancellationToken);
        return NoContent();
    }

    /// <summary>Puts several past runs on one pair. Runs already on a pair stay where they are.</summary>
    [HttpPost("{id:guid}/runs")]
    [ProducesResponseType<AddedDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> AddRuns(Guid id, RunsRequest runs, CancellationToken cancellationToken) =>
        Ok(new AddedDto(await dispatcher.Send(new WearShoeOnRunsCommand(id, runs.ActivityIds ?? [], runs.CheckInIds ?? []), cancellationToken)));

    /// <summary>Recent runs not on any pair, to put on one.</summary>
    [HttpGet("unworn-runs")]
    [ProducesResponseType<IReadOnlyList<UnassignedRunDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Unworn(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ListRunsWithoutShoesQuery(), cancellationToken));

    public sealed record RunsRequest(IReadOnlyList<Guid>? ActivityIds, IReadOnlyList<Guid>? CheckInIds);

    public sealed record AddedDto(int Added);
}
