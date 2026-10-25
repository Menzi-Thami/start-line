using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Notifications;

namespace StartLine.API.Controllers;

/// <summary>The signed-in runner's reminders: which of their devices get them, and when. Off unless they turn them on.</summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/reminders")]
public sealed class MyRemindersController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>Whether reminders can be turned on (and the key a browser subscribes with), and the runner's devices that have them.</summary>
    [HttpGet]
    [ProducesResponseType<RemindersDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new GetRemindersQuery(), cancellationToken));

    /// <summary>
    /// Turns reminders on for this device, or changes its time: the browser's push subscription, the local time for the
    /// day's run, and whether to hear about a new week on Mondays. 409 <c>reminders_unavailable</c> until push is configured.
    /// </summary>
    [HttpPut("devices")]
    [ProducesResponseType<ReminderDeviceDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> TurnOn([FromBody] TurnOnRemindersCommand request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(request, cancellationToken));

    /// <summary>Turns reminders off for one device and forgets its push address. Safe to repeat.</summary>
    [HttpDelete("devices/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> TurnOff(Guid id, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new TurnOffRemindersCommand(id), cancellationToken);
        return NoContent();
    }
}
