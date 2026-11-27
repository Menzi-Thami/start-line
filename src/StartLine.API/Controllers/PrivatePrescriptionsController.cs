using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using StartLine.API.Calendar;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.PrivatePlans;
using StartLine.Domain.Common;

namespace StartLine.API.Controllers;

[ApiController]
[Authorize(Policy = PresentationDependencyInjection.RunnerPolicy)]
[ApiVersion(1)]
[Route("api/v{version:apiVersion}/me/private-prescriptions")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PrivatePrescriptionsController(IDispatcher dispatcher, TimeProvider time) : ControllerBase
{
    public const int MaxImportBytes = 512 * 1024;
    private static readonly JsonSerializerOptions StrictJson = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        MaxDepth = 16,
        Converters = { new JsonStringEnumConverter(allowIntegerValues: false) },
    };

    [HttpGet("access")]
    public async Task<IActionResult> Access(CancellationToken cancellationToken) =>
        Ok(new { enabled = await dispatcher.Send(new PrivateAccessQuery(), cancellationToken) });

    /// <summary>Validates and persists an owner-only draft. This never changes the current plan.</summary>
    [HttpPost("preview")]
    [RequestSizeLimit(MaxImportBytes)]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    [ProducesResponseType<PrivateImportPreviewDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Preview([FromBody] JsonElement payload, CancellationToken cancellationToken)
    {
        CheckUniqueFields(payload);
        PrivateImportRequest request;
        try { request = payload.Deserialize<PrivateImportRequest>(StrictJson) ?? throw new JsonException(); }
        catch (JsonException) { throw new DomainException("The private import does not match schema version 1. Check the private import guide; remove unknown fields and use named types."); }
        return Ok(await dispatcher.Send(new PreviewPrivateImportCommand(request), cancellationToken));
    }

    [HttpPost("{id:guid}/activate")]
    [EnableRateLimiting(PresentationDependencyInjection.PlanRateLimitPolicy)]
    public async Task<IActionResult> Activate(Guid id, [FromBody] ActivatePrivateImportRequest request, CancellationToken cancellationToken)
    {
        var planId = await dispatcher.Send(new ActivatePrivateImportCommand(id, request.Token, request.ConsentToReplace), cancellationToken);
        return Ok(new { planId });
    }

    [HttpPut("plans/{planId:guid}/gym/{sessionId:guid}")]
    [ProducesResponseType<StartLine.Application.Features.Plans.TrainingPlanDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> CompleteGym(Guid planId, Guid sessionId, [FromBody] CompletePrivateGymRequest request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new PrivateGymCommand(planId, sessionId, request.Done, request.Effort), cancellationToken));

    [HttpPost("plans/{planId:guid}/gym/{sessionId:guid}/move")]
    [ProducesResponseType<PrivateGymMoveDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> MoveGym(Guid planId, Guid sessionId, [FromBody] MovePrivateGymRequest request, CancellationToken cancellationToken) =>
        Ok(await dispatcher.Send(new MovePrivateGymCommand(planId, sessionId, request.Target, request.Token), cancellationToken));

    [HttpGet("plans/{id:guid}/calendar.ics")]
    public async Task<IActionResult> Calendar(Guid id, CancellationToken cancellationToken)
    {
        var saved = await dispatcher.Send(new GetMyPlanQuery(id), cancellationToken);
        return File(Encoding.UTF8.GetBytes(PlanCalendar.Build(saved.Plan, false, time.GetUtcNow())), PlanCalendar.ContentType, "taperday-private-plan.ics");
    }

    private static void CheckUniqueFields(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var field in element.EnumerateObject())
            {
                if (!names.Add(field.Name)) throw new DomainException("Each import field may appear only once.");
                CheckUniqueFields(field.Value);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
            foreach (var item in element.EnumerateArray()) CheckUniqueFields(item);
    }
}

public sealed record ActivatePrivateImportRequest(string Token, bool ConsentToReplace);
public sealed record CompletePrivateGymRequest(bool Done, int? Effort = null);
public sealed record MovePrivateGymRequest(DateOnly? Target, string? Token = null);
