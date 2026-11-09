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
    /// <summary>The headline races, soonest first. Every other race is found with search.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<RaceDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new ListUpcomingRacesQuery(), cancellationToken));

    /// <summary>Upcoming races whose name or place matches <paramref name="q"/> (at least two letters), best first.</summary>
    [HttpGet("search")]
    [ProducesResponseType<IReadOnlyList<RaceDto>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] int? limit, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new SearchRacesQuery(q ?? "", limit ?? SearchRacesQuery.DefaultLimit), cancellationToken));

    /// <summary>One race by its slug.</summary>
    [HttpGet("{slug}")]
    [ProducesResponseType<RaceDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(string slug, CancellationToken cancellationToken) =>
        await dispatcher.Send(new GetRaceQuery(slug), cancellationToken) is { } race ? Ok(race) : NotFound();
}
