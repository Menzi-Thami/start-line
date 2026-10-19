using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Activities;

/// <summary>
/// Records a run, however it arrived: works out the day it was run in the runner's own time zone and the plan
/// session it was meant to be, then hands both to <see cref="Activity.Record"/>. Uploads and synced runs share this,
/// so they're judged the same way.
/// </summary>
internal sealed class ActivityRecorder(IApplicationDbContext db, PlanBuilder builder, IRaceCatalogue catalogue)
{
    public async Task<Activity> RecordAsync(Runner runner, ActivityRecording recording, ActivityOrigin origin, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(runner);
        ArgumentNullException.ThrowIfNull(recording);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(runner.TimeZone);
        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(recording.StartedAt.ToUniversalTime(), zone).DateTime);
        return Activity.Record(runner.Id, recording, localDate, await PlannedOnAsync(runner.Id, localDate, cancellationToken), origin);
    }

    /// <summary>Every run session the runner's active plans have on that day, with the pace each one asked for.</summary>
    private async Task<IReadOnlyList<PlannedSessionMatch>> PlannedOnAsync(Guid runnerId, DateOnly date, CancellationToken cancellationToken)
    {
        var saved = await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runnerId && p.Status == SavedPlanStatus.Active && p.Inputs.PlanFrom <= date)
            .ToListAsync(cancellationToken);

        List<PlannedSessionMatch> planned = [];
        foreach (var plan in saved)
        {
            // Only plans that were running that day: a finished plan, or one whose race has left the calendar, has nothing to say.
            var raceDate = plan.Inputs.RaceSlug is { } slug ? catalogue.FindBySlug(slug)?.Date : plan.Inputs.RaceDate;
            if (raceDate is null || raceDate < date)
            {
                continue;
            }

            var built = builder.BuildPlan(SavedPlanMapping.ToQuery(plan.Inputs));
            var sessions = built.Weeks.SelectMany(w => w.Sessions).ToList();
            var next = sessions.FirstOrDefault(s => s.Date > date && s.Type != SessionType.Strength);
            planned.AddRange(sessions.Where(s => s.Date == date).Select(s => Snapshot(plan.Name, s, built, next)));
        }

        return planned;
    }

    private static PlannedSessionMatch Snapshot(string planName, PlannedSession session, TrainingPlan plan, PlannedSession? next)
    {
        double? Fastest(PaceZone? zone) => zone is { } z && plan.Paces.TryGetValue(z, out var range) ? Math.Round(range.Fastest.SecondsPerKilometre) : null;
        double? Slowest(PaceZone? zone) => zone is { } z && plan.Paces.TryGetValue(z, out var range) ? Math.Round(range.Slowest.SecondsPerKilometre) : null;

        var shape = session.Shape;
        return new PlannedSessionMatch(
            planName,
            session.Type,
            session.Title,
            session.DistanceKm,
            Fastest(session.Zone),
            Slowest(session.Zone),
            session.Zone,
            shape.Shape,
            Math.Round(shape.WorkKm, 2),
            shape.WorkZone,
            Fastest(shape.WorkZone),
            Slowest(shape.WorkZone),
            shape.RepMetres,
            Fastest(PaceZone.Easy),
            Slowest(PaceZone.Easy),
            Math.Round(Pace.Of(plan.RaceDistance, plan.GoalTime).SecondsPerKilometre, 1),
            next?.Title,
            next?.Date);
    }
}
