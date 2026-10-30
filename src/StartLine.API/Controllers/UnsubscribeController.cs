using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Account;

namespace StartLine.API.Controllers;

/// <summary>
/// Unsubscribe from Taperday's news and update emails. Whoever reads an email isn't signed in, so it's anonymous and the
/// key from the email is the only way in; all it can do is turn update emails off. Two callers: Taperday's own page posts
/// the key as JSON, and a mail app's one-click button (RFC 8058) posts a form with the key in the query, as the
/// List-Unsubscribe header gives it. That query is kept out of traces (<see cref="Infrastructure.SecretPaths"/>).
/// </summary>
[ApiController]
[AllowAnonymous]
[ApiVersion(1)]
[EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
[Route("api/v{version:apiVersion}/unsubscribe")]
public sealed class UnsubscribeController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>Turns update emails off for the runner the key is for. Doing it again is fine.</summary>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Unsubscribe([FromBody] UnsubscribeRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        await dispatcher.Send(new UnsubscribeCommand(request.Token), cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// A mail app's one-click unsubscribe: a form post of <c>List-Unsubscribe=One-Click</c> to the address in the email's
    /// header. The form's content is only a marker; the key in the query is what counts.
    /// </summary>
    [HttpPost]
    [Consumes("application/x-www-form-urlencoded", "multipart/form-data")]
    [ApiExplorerSettings(IgnoreApi = true)]
    public async Task<IActionResult> OneClick([FromQuery(Name = "t")] string? token, CancellationToken cancellationToken)
    {
        await dispatcher.Send(new UnsubscribeCommand(token ?? ""), cancellationToken);
        return NoContent();
    }
}

/// <param name="Token">The key from the email's unsubscribe link.</param>
public sealed record UnsubscribeRequest(string Token);
