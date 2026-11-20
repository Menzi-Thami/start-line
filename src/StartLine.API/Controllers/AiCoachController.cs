using System.ComponentModel.DataAnnotations;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.AiCoach;
using StartLine.Domain.Plans;

namespace StartLine.API.Controllers;

/// <summary>
/// The coach (docs/ai-coach-mcp.md): exact changes to one upcoming run, checked by Taperday's rules and applied only from the
/// preview the runner saw, and questions in words, understood by the rules or (with the runner's agreement) an AI model whose
/// answers the rules check again. Off unless <c>AiCoach:Enabled</c>. Thin: bind, dispatch, return.
/// </summary>
[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me")]
public sealed class AiCoachController(IDispatcher dispatcher, AiCoachSettings settings) : ControllerBase
{
    /// <summary>Whether the coach is on, whether the AI part is available and agreed to, and the AI questions left today.</summary>
    [HttpGet("ai/status")]
    [ProducesResponseType<AiCoachStatusDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Status(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new AiCoachStatusQuery(), cancellationToken));
    }

    /// <summary>Gives or withdraws agreement to questions, the plan and own check-ins going to the AI provider.</summary>
    [HttpPut("ai/consent")]
    [ProducesResponseType<AiCoachStatusDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Consent([FromBody] AiConsentRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return Off() ?? Ok(await dispatcher.Send(new SetAiCoachConsentCommand(request.Consent), cancellationToken));
    }

    /// <summary>Asks the coach about the current plan. Never changes it: a suggested change comes back as a preview.</summary>
    [HttpPost("plans/{id:guid}/ai/ask")]
    [EnableRateLimiting(PresentationDependencyInjection.AiRateLimitPolicy)]
    [ProducesResponseType<CoachAnswerDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Ask(Guid id, [FromBody] AiCoachRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (Off() is { } off) return off;
        Response.Headers.CacheControl = "no-store";
        return Ok(await dispatcher.Send(new AskCoachCommand(id, request.Question), cancellationToken));
    }

    /// <summary>Previews an exact change to one upcoming run: a time, a distance or a pace. Nothing is saved.</summary>
    [HttpPost("plans/{id:guid}/session-adjustment/preview")]
    [ProducesResponseType<SessionAdjustmentDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> PreviewAdjustment(Guid id, [FromBody] SessionAdjustmentRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return Off() ?? Ok(await dispatcher.Send(new AdjustSessionCommand(id, request), cancellationToken));
    }

    /// <summary>Applies exactly the previewed change; 409 when the plan, the running or the day changed since.</summary>
    [HttpPost("plans/{id:guid}/session-adjustment/apply")]
    [ProducesResponseType<SessionAdjustmentDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> ApplyAdjustment(Guid id, [FromBody] ApplySessionAdjustmentRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        return Off() ?? Ok(await dispatcher.Send(new AdjustSessionCommand(id, request.Request, request.Token), cancellationToken));
    }

    private ObjectResult? Off() => settings.Enabled ? null
        : StatusCode(StatusCodes.Status503ServiceUnavailable, new ProblemDetails { Title = "The coach isn’t switched on yet.", Status = StatusCodes.Status503ServiceUnavailable });
}

public sealed record AiCoachRequest([Required, StringLength(AskCoachCommand.MaxQuestionLength, MinimumLength = 3)] string Question);

public sealed record AiConsentRequest(bool Consent);

public sealed record ApplySessionAdjustmentRequest([Required] SessionAdjustmentRequest Request, [Required, StringLength(64, MinimumLength = 64)] string Token);
