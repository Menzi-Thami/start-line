using System.Text.Json;
using System.Text.Json.Serialization;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.Sync;

namespace StartLine.API.Controllers;

/// <summary>
/// Strava's push subscription callback. Anonymous by necessity, so it's behind an unguessable path segment and a
/// per-IP rate limit, only ever queues work, and answers within Strava's 2-second deadline.
/// </summary>
[ApiController]
[AllowAnonymous]
[ApiVersion(1)]
[ApiExplorerSettings(IgnoreApi = true)]
[EnableRateLimiting(PresentationDependencyInjection.WebhookRateLimitPolicy)]
[Route("api/v{version:apiVersion}/webhooks/strava/{secret}")]
public sealed class StravaWebhookController(IDispatcher dispatcher) : ControllerBase
{
    /// <summary>Strava validating the callback while the subscription is created.</summary>
    [HttpGet]
    public async Task<IActionResult> Verify(
        string secret,
        [FromQuery(Name = "hub.mode")] string? mode,
        [FromQuery(Name = "hub.verify_token")] string? verifyToken,
        [FromQuery(Name = "hub.challenge")] string? challenge,
        CancellationToken cancellationToken)
    {
        var echoed = await dispatcher.Send(new VerifyStravaWebhookQuery(secret, mode, verifyToken, challenge), cancellationToken);
        return Ok(new Dictionary<string, string> { ["hub.challenge"] = echoed });
    }

    /// <summary>One event. Always 200 once it's understood, even when it's for nobody Taperday knows, so Strava doesn't retry it.</summary>
    [HttpPost]
    public async Task<IActionResult> Receive(string secret, [FromBody] StravaEventBody body, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(body);
        var updates = body.Updates?.ToDictionary(u => u.Key, u => u.Value.ValueKind == JsonValueKind.String ? u.Value.GetString() ?? "" : u.Value.ToString(), StringComparer.Ordinal);
        await dispatcher.Send(
            new ReceiveStravaEventCommand(secret, new StravaEvent(body.ObjectType ?? "", body.ObjectId, body.AspectType ?? "", body.OwnerId, body.SubscriptionId, body.EventTime, updates)),
            cancellationToken);
        return Ok();
    }
}

/// <summary>An event exactly as Strava sends it (snake_case).</summary>
public sealed record StravaEventBody(
    [property: JsonPropertyName("object_type")] string? ObjectType,
    [property: JsonPropertyName("object_id")] long ObjectId,
    [property: JsonPropertyName("aspect_type")] string? AspectType,
    [property: JsonPropertyName("owner_id")] long OwnerId,
    [property: JsonPropertyName("subscription_id")] long SubscriptionId,
    [property: JsonPropertyName("event_time")] long EventTime,
    [property: JsonPropertyName("updates")] Dictionary<string, JsonElement>? Updates);
