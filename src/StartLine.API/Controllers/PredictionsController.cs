using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Predictions;

namespace StartLine.API.Controllers;

[ApiController]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/predictions")]
public sealed class PredictionsController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>Predicts a finish time at one distance from a recent result at another.</summary>
    /// <param name="fromKm">Distance of the recent result, in km.</param>
    /// <param name="time">Recent result, as hh:mm:ss.</param>
    /// <param name="toKm">Distance to predict, in km.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    [HttpGet]
    [ProducesResponseType<PredictionDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Predict(
        [FromQuery] double fromKm,
        [FromQuery] TimeSpan time,
        [FromQuery] double toKm,
        CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new PredictRaceTimeQuery(fromKm, time, toKm), cancellationToken));
}
