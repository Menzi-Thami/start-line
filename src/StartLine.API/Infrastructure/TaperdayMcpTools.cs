using System.ComponentModel;
using ModelContextProtocol.Server;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.MyPlans;
using StartLine.Domain.Plans;

namespace StartLine.API.Infrastructure;

/// <summary>
/// Read-only runner-scoped MCP tools. All reads use existing application queries,
/// which verify plan ownership from the validated Entra token.
/// Never expose Strava import/sync endpoints or linked activity data to external assistants.
/// </summary>
[McpServerToolType]
public sealed class TaperdayMcpTools(IDispatcher dispatcher)
{
    [McpServerTool(Name = "list_my_plans", ReadOnly = true),
     Description("List the authenticated runner's Taperday plan summaries. No Strava data.")]
    public async Task<IReadOnlyList<SavedPlanSummaryDto>> ListMyPlans(CancellationToken cancellationToken) =>
        await dispatcher.Send(new ListMyPlansQuery(), cancellationToken);

    [McpServerTool(Name = "get_training_plan", ReadOnly = true),
     Description("Read a plan belonging to the signed-in runner, including scheduled distances, paces and workout instructions. No imported run data.")]
    public async Task<object> GetTrainingPlan(
        [Description("The runner-owned plan ID returned by list_my_plans")] Guid planId,
        CancellationToken cancellationToken)
    {
        var saved = await dispatcher.Send(new GetMyPlanQuery(planId), cancellationToken);
        return new
        {
            saved.Id, saved.Name, saved.Status, saved.Plan.Race, saved.Plan.GoalTime,
            saved.Plan.Paces, saved.Plan.Weeks,
        };
    }

    [McpServerTool(Name = "get_manual_checkins", ReadOnly = true),
     Description("Read the runner's independently entered training check-ins; linked/imported activities are excluded, including Strava.")]
    public async Task<object> GetManualCheckIns(
        [Description("The runner-owned plan ID")] Guid planId,
        CancellationToken cancellationToken)
    {
        var entries = await dispatcher.Send(new ListCheckInsQuery(planId), cancellationToken);
        return entries.Where(entry => entry.ActivityId is null)
            .Select(entry => new
            {
                entry.Date, entry.SessionType, entry.Status,
                entry.DistanceKm,
                entry.Duration,
                entry.Effort
            }).ToArray();
    }
}
