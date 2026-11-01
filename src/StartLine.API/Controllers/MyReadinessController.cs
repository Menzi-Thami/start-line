using System.ComponentModel.DataAnnotations;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Coaching;
using StartLine.Domain.Coaching;

namespace StartLine.API.Controllers;

/// <summary>
/// How the runner felt each day: optional check-ins they can log, change or clear for today and the 13 days before. The
/// weekly review reads today's or yesterday's as its readiness answer when the runner doesn't give one there.
/// </summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/readiness")]
public sealed class MyReadinessController(IDispatcher dispatcher) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ReadinessDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken, [FromQuery] int days = DailyReadiness.EditableDays)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new ListMyReadinessQuery(days), cancellationToken));
    }

    [HttpPut("{date}")]
    [ProducesResponseType<ReadinessDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Log(DateOnly date, [FromBody] LogReadinessRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return Ok(await dispatcher.Send(new LogReadinessCommand(date, request.Feeling, request.Sleep, request.Soreness, request.Note), cancellationToken));
    }

    [HttpDelete("{date}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Clear(DateOnly date, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new ClearReadinessCommand(date), cancellationToken);
        return NoContent();
    }
}

/// <param name="Feeling">How they feel overall.</param>
/// <param name="Sleep">How they slept, if they want to say.</param>
/// <param name="Soreness">How sore their legs are, if they want to say.</param>
/// <param name="Note">Anything else, up to 280 characters.</param>
public sealed record LogReadinessRequest(Feeling Feeling, SleepQuality? Sleep = null, Soreness? Soreness = null, [StringLength(DailyReadiness.MaxNoteLength)] string? Note = null);
