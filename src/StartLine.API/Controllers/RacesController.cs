using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Races;

namespace StartLine.API.Controllers;

[ApiController]
[AllowAnonymous]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/races")]
public sealed class RacesController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>Upcoming races in the catalogue, soonest first.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<RaceDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ListUpcomingRacesQuery(), cancellationToken));
}
