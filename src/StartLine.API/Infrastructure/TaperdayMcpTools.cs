using System.ComponentModel;
using ModelContextProtocol.Server;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Features.AiCoach;
using StartLine.Application.Features.MyPlans;
using StartLine.Domain.Plans;

namespace StartLine.API.Infrastructure;

/// <summary>
/// Read-only, runner-scoped MCP tools (docs/ai-coach-mcp.md). Every read goes through the same application queries as the app,
/// which find the runner from the validated token and check plan ownership. Training comes only through the coach's evidence
/// projection: the runner's own check-ins and uploads, never Strava data (Strava API Policy). Nothing here writes: a previewed
/// change is applied by the runner in Taperday.
/// </summary>
[McpServerToolType]
public sealed class TaperdayMcpTools(IDispatcher dispatcher)
{
    [McpServerTool(Name = "list_my_plans", ReadOnly = true, Idempotent = true),
     Description("List the signed-in runner's Taperday training plans: id, name, race and status. Contains no Strava data.")]
    public async Task<IReadOnlyList<SavedPlanSummaryDto>> ListMyPlans(CancellationToken cancellationToken) =>
        await dispatcher.Send(new ListMyPlansQuery(), cancellationToken);

    [McpServerTool(Name = "get_training_plan", ReadOnly = true, Idempotent = true),
     Description("Read one of the signed-in runner's plans: race, goal, pace zones and every week's sessions with distances and steps.")]
    public async Task<object> GetTrainingPlan(
        [Description("A plan id from list_my_plans")] Guid planId,
        CancellationToken cancellationToken)
    {
        var saved = await dispatcher.Send(new GetMyPlanQuery(planId), cancellationToken);
        return new { saved.Id, saved.Name, saved.Status, saved.Plan.Race, saved.Plan.GoalTime, saved.Plan.Paces, saved.Plan.Weeks };
    }

    [McpServerTool(Name = "get_my_training", ReadOnly = true, Idempotent = true),
     Description("The runner's own training from the last 28 days: check-ins they entered and runs they uploaded, each labelled with its source. Strava runs, and check-ins linked to them, are never included.")]
    public async Task<TrainingEvidenceDto> GetMyTraining(
        [Description("A plan id from list_my_plans")] Guid planId,
        CancellationToken cancellationToken) =>
        await dispatcher.Send(new GetTrainingEvidenceQuery(planId), cancellationToken);

    [McpServerTool(Name = "preview_run_change", ReadOnly = true),
     Description("Check a change to one upcoming run against Taperday's training rules without saving it: the time the runner has (minutes), a distance (km) or a pace (seconds per km). Returns the decision, the reason and the run before and after. The runner applies a change in Taperday.")]
    public async Task<object> PreviewRunChange(
        [Description("A plan id from list_my_plans")] Guid planId,
        [Description("The run's date, YYYY-MM-DD, from today to the next 13 days")] DateOnly date,
        [Description("What to change: Duration, Distance or Pace")] string kind,
        [Description("For Duration: the minutes the runner has")] int? minutes = null,
        [Description("For Distance: the km wanted")] double? km = null,
        [Description("For Pace: seconds per km wanted")] int? paceSecondsPerKm = null,
        CancellationToken cancellationToken = default)
    {
        if (!Enum.TryParse<AdjustmentKind>(kind, ignoreCase: true, out var what) || !Enum.IsDefined(what))
            throw new ModelContextProtocol.McpException("kind must be Duration, Distance or Pace.");
        var preview = await dispatcher.Send(new AdjustSessionCommand(planId, new SessionAdjustmentRequest(date, what, minutes, km, paceSecondsPerKm)), cancellationToken);
        return new { preview.Outcome, preview.Reason, preview.Before, preview.After, preview.BecomesRest, preview.WeekKmBefore, preview.WeekKmAfter, preview.SafeLimitKm };
    }
}
