using System.Text;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Activities;

namespace StartLine.API.Controllers;

/// <summary>
/// The runner's run data as a whole: where each run came from, what makes up their totals, possible duplicates, gaps,
/// runs that didn't sync, and exporting or deleting runs.
/// </summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/run-data")]
public sealed class MyRunDataController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<RunDataDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        // Built from synced runs, which may be held only for a short time: never cached anywhere.
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new GetRunDataQuery(), cancellationToken));
    }

    /// <summary>Tries again every run from Strava that failed after its automatic retries.</summary>
    [HttpPost("retry-strava")]
    [ProducesResponseType<RetriedDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RetryStrava(CancellationToken cancellationToken) =>
        Ok(new RetriedDto(await dispatcher.Send(new RetryStravaFetchesCommand(), cancellationToken)));

    /// <summary>Both runs in an overlapping pair are real: stop flagging them.</summary>
    [HttpPost("keep-both")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> KeepBoth(KeepBothRunsCommand command, CancellationToken cancellationToken)
    {
        await dispatcher.Send(command, cancellationToken);
        return NoContent();
    }

    /// <summary>Deletes up to 100 of the runner's runs at once.</summary>
    [HttpPost("delete")]
    [ProducesResponseType<DeletedDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Delete(DeleteMyActivitiesCommand command, CancellationToken cancellationToken) =>
        Ok(new DeletedDto(await dispatcher.Send(command, cancellationToken)));

    /// <summary>Every run as a CSV file, with where each one came from.</summary>
    [HttpGet("export.csv")]
    [Produces("text/csv")]
    public async Task<IActionResult> Export(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var csv = await dispatcher.Send(new ExportMyRunsQuery(), cancellationToken);
        return File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray(), "text/csv", "taperday-runs.csv");
    }

    public sealed record RetriedDto(int Retried);

    public sealed record DeletedDto(int Deleted);
}
