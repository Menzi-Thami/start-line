using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;

namespace StartLine.API.Controllers;

[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me")]
public sealed class MeController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>The signed-in runner's profile. 404 until they finish signing up.</summary>
    [HttpGet]
    [ProducesResponseType<RunnerDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new GetProfileQuery(), cancellationToken));

    /// <summary>Signs up (first call, privacy notice must be accepted) or updates the profile.</summary>
    [HttpPut]
    [ProducesResponseType<RunnerDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Save([FromBody] SaveProfileCommand request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(request, cancellationToken));

    /// <summary>Everything stored about the runner, as a downloadable file.</summary>
    [HttpGet("export")]
    [ProducesResponseType<AccountExportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Export(CancellationToken cancellationToken)
    {
        var export = await dispatcher.Send(new ExportAccountQuery(), cancellationToken);
        Response.Headers.ContentDisposition = "attachment; filename=start-line-my-data.json";
        return Ok(export);
    }

    /// <summary>Deletes the runner and all their plans. Safe to repeat.</summary>
    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteAccountCommand(), cancellationToken);
        return NoContent();
    }
}
