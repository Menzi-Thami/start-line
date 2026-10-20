using System.Globalization;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Activities;

/// <summary>
/// Reads one activity file, matches it to the plan and saves it. Shared by the single upload and the bulk import, because
/// a handler must never dispatch another handler. Scoped: each saved plan is built at most once per request, so a batch
/// of runs from the same weeks doesn't regenerate the same plan for every file.
/// </summary>
internal sealed class ActivityImporter(IApplicationDbContext db, IActivityFileReader reader, PlanBuilder builder, IRaceCatalogue catalogue)
{
    private readonly Dictionary<Guid, TrainingPlan> builtPlans = [];
    private List<SavedPlan>? activePlans;

    /// <summary>
    /// Throws <see cref="ValidationException"/> for a file that can't be read, <see cref="Domain.Common.DomainException"/>
    /// for one that isn't a run, and <see cref="ConflictException"/> for a duplicate or when the runner is at the limit.
    /// </summary>
    public async Task<Activity> ImportAsync(Runner runner, Stream file, CancellationToken cancellationToken)
    {
        if (await db.Activities.CountAsync(a => a.RunnerId == runner.Id, cancellationToken) >= Activity.MaxPerRunner)
        {
            throw new ConflictException(LimitCode, string.Create(
                CultureInfo.InvariantCulture, $"You can keep up to {Activity.MaxPerRunner:N0} runs. Delete an old one to add another."));
        }

        var recording = reader.Read(file);
        var startedAt = recording.StartedAt.ToUniversalTime();
        if (await db.Activities.AnyAsync(a => a.RunnerId == runner.Id && a.StartedAt == startedAt, cancellationToken))
        {
            throw Duplicate();
        }

        var zone = TimeZoneInfo.FindSystemTimeZoneById(runner.TimeZone);
        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(startedAt, zone).DateTime);
        var activity = Activity.Record(runner.Id, recording, localDate, await PlannedOnAsync(runner.Id, localDate, cancellationToken));

        db.Activities.Add(activity);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The same file uploaded twice at once (a double tap): the unique index let only one in.
            // Anything else is a real failure: rethrow.
            db.Activities.Entry(activity).State = EntityState.Detached;
            if (await db.Activities.AnyAsync(a => a.RunnerId == runner.Id && a.StartedAt == startedAt, cancellationToken))
            {
                throw Duplicate();
            }

            throw;
        }

        return activity;
    }

    public const string DuplicateCode = "activity_exists";
    public const string LimitCode = "activity_limit";

    private static ConflictException Duplicate() => new(DuplicateCode, "You've already uploaded this run.");

    /// <summary>Every run session the runner's active plans have on that day, with the pace each one asked for.</summary>
    private async Task<IReadOnlyList<PlannedSessionMatch>> PlannedOnAsync(Guid runnerId, DateOnly date, CancellationToken cancellationToken)
    {
        activePlans ??= await db.SavedPlans.AsNoTracking()
            .Where(p => p.RunnerId == runnerId && p.Status == SavedPlanStatus.Active)
            .ToListAsync(cancellationToken);

        List<PlannedSessionMatch> planned = [];
        foreach (var plan in activePlans.Where(p => p.Inputs.PlanFrom <= date))
        {
            // Only plans that were running that day: a finished plan, or one whose race has left the calendar, has nothing to say.
            var raceDate = plan.Inputs.RaceSlug is { } slug ? catalogue.FindBySlug(slug)?.Date : plan.Inputs.RaceDate;
            if (raceDate is null || raceDate < date)
            {
                continue;
            }

            if (!builtPlans.TryGetValue(plan.Id, out var built))
            {
                built = builder.BuildPlan(SavedPlanMapping.ToQuery(plan.Inputs));
                builtPlans[plan.Id] = built;
            }

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
