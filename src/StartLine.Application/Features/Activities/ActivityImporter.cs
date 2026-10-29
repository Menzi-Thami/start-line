using System.Globalization;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Activities;

/// <summary>
/// Reads one activity file, matches it to the plan and saves it; and records runs synced from Strava the same way, so
/// both are judged alike. Shared by the single upload, the bulk import and the Strava sync, because a handler must never
/// dispatch another handler. Scoped: each saved plan is built at most once per request (or sync pass), so a batch of
/// runs from the same weeks doesn't regenerate the same plan for every file.
/// </summary>
internal sealed class ActivityImporter(IApplicationDbContext db, IActivityFileReader reader, PlanBuilder builder, IRaceCatalogue catalogue, TimeProvider time)
{
    private readonly Dictionary<Guid, TrainingPlan> builtPlans = [];

    // Per runner: a sync pass records runs for several runners in one scope.
    private readonly Dictionary<Guid, List<SavedPlan>> activePlans = [];

    /// <summary>
    /// Throws <see cref="ValidationException"/> for a file that can't be read, <see cref="Domain.Common.DomainException"/>
    /// for one that isn't a run, and <see cref="ConflictException"/> for a duplicate or when the runner is at the limit.
    /// </summary>
    public async Task<Activity> ImportAsync(Runner runner, Stream file, CancellationToken cancellationToken)
    {
        if (await db.Activities.Visible(time.GetUtcNow()).CountAsync(a => a.RunnerId == runner.Id, cancellationToken) >= Activity.MaxPerRunner)
        {
            throw new ConflictException(LimitCode, string.Create(
                CultureInfo.InvariantCulture, $"You can keep up to {Activity.MaxPerRunner:N0} runs. Delete an old one to add another."));
        }

        var recording = reader.Read(file);
        var startedAt = recording.StartedAt.ToUniversalTime();
        var existing = await db.Activities.SingleOrDefaultAsync(a => a.RunnerId == runner.Id && a.StartedAt == startedAt, cancellationToken);
        if (existing is { Source: ActivitySource.Upload })
        {
            throw Duplicate();
        }

        var activity = await RecordAsync(runner, recording, ActivityOrigin.Upload, cancellationToken);

        // The file of a run that was synced replaces the synced copy: uploads are the runner's own and are kept,
        // where a synced copy lapses. The two are never merged into one record (Strava API Policy 5.4).
        if (existing is not null)
        {
            db.Activities.Remove(existing);
        }

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
            if (existing is not null)
            {
                db.Activities.Entry(existing).State = EntityState.Unchanged;
            }

            if (await db.Activities.AsNoTracking().AnyAsync(a => a.RunnerId == runner.Id && a.StartedAt == startedAt, cancellationToken))
            {
                throw Duplicate();
            }

            throw;
        }

        return activity;
    }

    /// <summary>
    /// Works out the day a run was run in the runner's own time zone and the plan session it was meant to be, and
    /// records it. Doesn't save: the Strava sync decides whether it's new, a refresh, or already uploaded.
    /// </summary>
    public async Task<Activity> RecordAsync(Runner runner, ActivityRecording recording, ActivityOrigin origin, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(runner);
        ArgumentNullException.ThrowIfNull(recording);
        // The time zone is validated when the profile is saved, so it almost always resolves. If a time-zone database
        // ever drops an id, fall back to UTC for this one run rather than throwing: on the sync path an uncaught throw
        // would stall every runner's sync, not just this one.
        var zone = TimeZoneInfo.TryFindSystemTimeZoneById(runner.TimeZone, out var found) ? found : TimeZoneInfo.Utc;
        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(recording.StartedAt.ToUniversalTime(), zone).DateTime);
        // Heart rate is kept only with the runner's separate consent (POPIA special personal information); without it
        // every reading is dropped here, before anything is worked out or stored, for uploads and synced runs alike.
        if (!runner.HeartRateConsent)
        {
            recording = recording.WithoutHeartRate();
        }

        return Activity.Record(runner.Id, recording, localDate, await PlannedOnAsync(runner.Id, localDate, cancellationToken), origin);
    }

    public const string DuplicateCode = "activity_exists";
    public const string LimitCode = "activity_limit";

    private static ConflictException Duplicate() => new(DuplicateCode, "You've already uploaded this run.");

    /// <summary>Every run session the runner's active plans have on that day, with the pace each one asked for.</summary>
    private async Task<IReadOnlyList<PlannedSessionMatch>> PlannedOnAsync(Guid runnerId, DateOnly date, CancellationToken cancellationToken)
    {
        if (!activePlans.TryGetValue(runnerId, out var plans))
        {
            plans = await db.SavedPlans.AsNoTracking()
                .Where(p => p.RunnerId == runnerId && p.Status == SavedPlanStatus.Active)
                .ToListAsync(cancellationToken);
            activePlans[runnerId] = plans;
        }

        List<PlannedSessionMatch> planned = [];
        foreach (var plan in plans.Where(p => p.Inputs.PlanFrom <= date))
        {
            // Only plans that were running that day: a finished plan, or one whose race has left the calendar, has nothing to say.
            var raceDate = plan.Inputs.RaceSlug is { } slug ? catalogue.FindBySlug(slug)?.Date : plan.Inputs.RaceDate;
            if (raceDate is null || raceDate < date)
            {
                continue;
            }

            if (!builtPlans.TryGetValue(plan.Id, out var built))
            {
                built = builder.BuildPlan(SavedPlanMapping.ToQuery(plan.Inputs), await CoachCalls.ForAsync(db, plan.Id, cancellationToken), plan.Adjustments, date);
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
