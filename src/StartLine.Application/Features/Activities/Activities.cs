using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Activities;

/// <summary>
/// Reads a watch's activity file into a recording. Implementations throw <see cref="ValidationException"/> (key
/// <c>file</c>) for anything they can't read, and never keep the file or any GPS positions.
/// </summary>
public interface IActivityFileReader
{
    ActivityRecording Read(Stream file);
}

public static class ActivityUpload
{
    /// <summary>A marathon recorded every second is 1–2 MB, a 100 km ultra about 5 MB.</summary>
    public const int MaxFileBytes = 10 * 1024 * 1024;

    /// <summary>The file plus the multipart envelope around it.</summary>
    public const int MaxRequestBytes = MaxFileBytes + (64 * 1024);
}

/// <summary>Imports one run from a Garmin .FIT file (or the .zip Garmin Connect's "Export Original" gives you).</summary>
public sealed record ImportActivityCommand(Stream File) : IRequest<ActivityDto>;

internal sealed class ImportActivityValidator : AbstractValidator<ImportActivityCommand>
{
    public ImportActivityValidator()
    {
        RuleFor(c => c.File)
            .NotNull()
            .Must(f => f is { CanRead: true, CanSeek: true, Length: > 0 }).WithMessage("Choose a .fit file to upload.")
            .Must(f => f is { CanSeek: true } && f.Length <= ActivityUpload.MaxFileBytes)
            .WithMessage($"That file is too big. Activity files are up to {ActivityUpload.MaxFileBytes / 1024 / 1024} MB.")
            .OverridePropertyName("file");
    }
}

internal sealed class ImportActivityHandler(
    IApplicationDbContext db,
    CurrentRunner current,
    IActivityFileReader reader,
    PlanBuilder builder,
    IRaceCatalogue catalogue,
    PersonalBests personalBests)
    : IRequestHandler<ImportActivityCommand, ActivityDto>
{
    public async Task<ActivityDto> Handle(ImportActivityCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireAsync(cancellationToken);
        if (await db.Activities.CountAsync(a => a.RunnerId == runner.Id, cancellationToken) >= Activity.MaxPerRunner)
        {
            throw new ConflictException("activity_limit", $"You can keep up to {Activity.MaxPerRunner:N0} runs. Delete an old one to add another.");
        }

        var recording = reader.Read(request.File);
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

        var bests = await personalBests.ForRunnerAsync(runner.Id, cancellationToken);
        return ActivityDto.From(activity, bests.FromRunsOtherThan(activity.Id), runner.MaxHeartRate);
    }

    private static ConflictException Duplicate() =>
        new("activity_exists", "You've already uploaded this run.");

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

/// <summary>Every best effort the runner has stored, so each run can be measured against the others.</summary>
internal sealed class PersonalBests(IApplicationDbContext db)
{
    public async Task<RunnerBests> ForRunnerAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        var efforts = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runnerId)
            .SelectMany(a => a.BestEfforts.Select(e => new { ActivityId = a.Id, e.DistanceMetres, e.Elapsed }))
            .ToListAsync(cancellationToken);
        return new RunnerBests([.. efforts.Select(e => (e.ActivityId, e.DistanceMetres, e.Elapsed))]);
    }
}

internal sealed class RunnerBests(IReadOnlyList<(Guid ActivityId, double DistanceMetres, TimeSpan Elapsed)> efforts)
{
    /// <summary>The fastest time per distance from every run but this one: what this run's efforts are measured against.</summary>
    public IReadOnlyDictionary<double, TimeSpan> FromRunsOtherThan(Guid activityId) => efforts
        .Where(e => e.ActivityId != activityId)
        .GroupBy(e => e.DistanceMetres)
        .ToDictionary(g => g.Key, g => g.Min(e => e.Elapsed));
}

/// <summary>The runner's runs, newest first. At most <see cref="Activity.MaxPerRunner"/>, so no paging yet.</summary>
public sealed record ListMyActivitiesQuery : IRequest<IReadOnlyList<ActivitySummaryDto>>;

internal sealed class ListMyActivitiesHandler(IApplicationDbContext db, CurrentRunner current)
    : IRequestHandler<ListMyActivitiesQuery, IReadOnlyList<ActivitySummaryDto>>
{
    public async Task<IReadOnlyList<ActivitySummaryDto>> Handle(ListMyActivitiesQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            return [];
        }

        var activities = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runner.Id)
            .OrderByDescending(a => a.StartedAt)
            .Take(Activity.MaxPerRunner)
            .ToListAsync(cancellationToken);
        return [.. activities.Select(ActivitySummaryDto.From)];
    }
}

public sealed record GetMyActivityQuery(Guid Id) : IRequest<ActivityDto>;

internal sealed class GetMyActivityHandler(IApplicationDbContext db, CurrentRunner current, PersonalBests personalBests)
    : IRequestHandler<GetMyActivityQuery, ActivityDto>
{
    public async Task<ActivityDto> Handle(GetMyActivityQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        // Someone else's run is "not found", never "forbidden": the API must not confirm it exists.
        var activity = runner is null
            ? null
            : await db.Activities.AsNoTracking()
                .SingleOrDefaultAsync(a => a.Id == request.Id && a.RunnerId == runner.Id, cancellationToken);
        if (activity is null)
        {
            throw new NotFoundException("Activity", request.Id.ToString());
        }

        var bests = await personalBests.ForRunnerAsync(runner!.Id, cancellationToken);
        return ActivityDto.From(activity, bests.FromRunsOtherThan(activity.Id), runner.MaxHeartRate);
    }
}

public sealed record DeleteMyActivityCommand(Guid Id) : IRequest<bool>;

internal sealed class DeleteMyActivityHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteMyActivityCommand, bool>
{
    public async Task<bool> Handle(DeleteMyActivityCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var activity = runner is null
            ? null
            : await db.Activities.SingleOrDefaultAsync(a => a.Id == request.Id && a.RunnerId == runner.Id, cancellationToken);
        if (activity is null)
        {
            throw new NotFoundException("Activity", request.Id.ToString());
        }

        db.Activities.Remove(activity);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}
