using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Calendar;

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

    /// <summary>
    /// Accepts the current privacy notice (for a runner who signed up under an older one) with their separate,
    /// optional heart-rate choice. Saying no to heart rate deletes any already stored.
    /// </summary>
    [HttpPut("privacy")]
    [ProducesResponseType<RunnerDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AcceptPrivacy([FromBody] AcceptPrivacyNoticeCommand request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(request, cancellationToken));

    /// <summary>
    /// The runs behind the runner's long-term totals, this year and the last 13 weeks at least: sessions they ticked off,
    /// at the plan's distance, and runs they uploaded, at their own. Never a synced Strava run, which is kept 7 days only.
    /// </summary>
    [HttpGet("running")]
    [ProducesResponseType<IReadOnlyList<LoggedRunDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Running(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new GetRunningLogQuery(), cancellationToken));

    /// <summary>Everything stored about the runner, as a downloadable file.</summary>
    [HttpGet("export")]
    [ProducesResponseType<AccountExportDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Export(CancellationToken cancellationToken)
    {
        var export = await dispatcher.Send(new ExportAccountQuery(), cancellationToken);
        Response.Headers.ContentDisposition = "attachment; filename=taperday-my-data.json";
        return Ok(export);
    }

    /// <summary>
    /// The secret for the runner's personal calendar feed (GET /api/v1/calendar/{token}.ics), made the first time it's asked
    /// for. The feed always shows their current plan, so a calendar subscribed to it follows every change.
    /// </summary>
    [HttpGet("calendar")]
    [ProducesResponseType<CalendarLinkDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Calendar(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new GetMyCalendarLinkQuery(), cancellationToken));

    /// <summary>A new calendar secret. The old link stops working straight away, wherever it was added.</summary>
    [HttpPost("calendar/reset")]
    [ProducesResponseType<CalendarLinkDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ResetCalendar(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ResetMyCalendarLinkCommand(), cancellationToken));

    /// <summary>The runner's picture as a data URL, or 204 when they haven't added one (the app shows their initials).</summary>
    [HttpGet("photo")]
    [ProducesResponseType<RunnerPhotoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Photo(CancellationToken cancellationToken) =>
        await dispatcher.Send(new GetMyPhotoQuery(), cancellationToken) is { } photo ? Ok(photo) : NoContent();

    /// <summary>Adds or replaces the runner's picture: a JPEG, PNG or WebP data URL of at most 96 KB.</summary>
    [HttpPut("photo")]
    [ProducesResponseType<RunnerPhotoDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SetPhoto(SetMyPhotoCommand command, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(command, cancellationToken));

    /// <summary>Removes the runner's picture. Safe to repeat.</summary>
    [HttpDelete("photo")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeletePhoto(CancellationToken cancellationToken)
    {
        await dispatcher.Send(new DeleteMyPhotoCommand(), cancellationToken);
        return NoContent();
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
