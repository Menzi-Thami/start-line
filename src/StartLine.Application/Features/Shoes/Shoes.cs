using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Activities;
using StartLine.Application.Features.Notifications;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Notifications;
using StartLine.Domain.Shoes;

namespace StartLine.Application.Features.Shoes;

/// <summary>The pair a run was worn in, for showing next to the run.</summary>
public sealed record ShoeRefDto(Guid Id, string Name);

/// <summary>
/// A pair of shoes with its distance worked out now: the distance it had already run when added, plus every assigned
/// run that still exists. <see cref="StravaKm"/> is the part that comes from Strava copies, which counts only while
/// Taperday holds those runs.
/// </summary>
public sealed record ShoeDto(
    Guid Id,
    string Name,
    double StartingKm,
    double LimitKm,
    double TotalKm,
    int Runs,
    double StravaKm,
    DateOnly? LastRunOn,
    bool IsDefault,
    bool RemindAtLimit,
    bool Retired,
    ShoeWear Wear);

/// <summary>A recent run without a pair: something the runner may want to put on one.</summary>
public sealed record UnassignedRunDto(Guid? ActivityId, Guid? CheckInId, DateOnly Date, double DistanceKm, string Title, string Source);

public sealed record SaveShoeRequest(string Name, double StartingKm, double LimitKm = Shoe.DefaultLimitKm, bool IsDefault = false, bool RemindAtLimit = true, bool Retired = false);

/// <summary>
/// Works out how far each pair has gone, from the runs assigned to it, at the moment it's asked. A check-in linked to
/// an uploaded or synced run counts once: the run's own distance wins, so a run is never counted twice on a pair.
/// </summary>
internal sealed class ShoeMileage(IApplicationDbContext db, TimeProvider time)
{
    public sealed record Totals(double Km, int Runs, double StravaKm, DateOnly? LastRunOn);

    public async Task<Dictionary<Guid, Totals>> ForRunnerAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        var assignments = await db.ShoeAssignments.AsNoTracking().Where(a => a.RunnerId == runnerId).ToListAsync(cancellationToken);
        var activityIds = assignments.Where(a => a.ActivityId is not null).Select(a => a.ActivityId!.Value).ToList();
        var checkInIds = assignments.Where(a => a.CheckInId is not null).Select(a => a.CheckInId!.Value).ToList();
        var runs = await db.Activities.AsNoTracking().Visible(time.GetUtcNow())
            .Where(a => a.RunnerId == runnerId && activityIds.Contains(a.Id))
            .Select(a => new { a.Id, a.DistanceMetres, a.Source, a.LocalDate })
            .ToDictionaryAsync(a => a.Id, cancellationToken);
        var plans = db.SavedPlans.Where(p => p.RunnerId == runnerId).Select(p => p.Id);
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => checkInIds.Contains(c.Id) && plans.Contains(c.SavedPlanId) && c.Status != CheckInStatus.Skipped)
            .Select(c => new { c.Id, c.DistanceKm, c.ActivityId, c.Date })
            .ToDictionaryAsync(c => c.Id, cancellationToken);
        var wornRuns = assignments.Where(a => a.ActivityId is { } id && runs.ContainsKey(id)).Select(a => a.ActivityId!.Value).ToHashSet();

        var totals = new Dictionary<Guid, Totals>();
        foreach (var byShoe in assignments.GroupBy(a => a.ShoeId))
        {
            double km = 0, stravaKm = 0;
            var count = 0;
            DateOnly? last = null;
            foreach (var assignment in byShoe)
            {
                if (assignment.ActivityId is { } activityId && runs.TryGetValue(activityId, out var run))
                {
                    km += run.DistanceMetres / 1000;
                    stravaKm += run.Source == ActivitySource.Strava ? run.DistanceMetres / 1000 : 0;
                    count++;
                    last = Later(last, run.LocalDate);
                }
                else if (assignment.CheckInId is { } checkInId && checkIns.TryGetValue(checkInId, out var checkIn)
                    && checkIn.DistanceKm is { } distance && !(checkIn.ActivityId is { } linked && wornRuns.Contains(linked)))
                {
                    km += distance;
                    count++;
                    last = Later(last, checkIn.Date);
                }
            }

            totals[byShoe.Key] = new Totals(Math.Round(km, 2), count, Math.Round(stravaKm, 2), last);
        }

        return totals;
    }

    private static DateOnly? Later(DateOnly? current, DateOnly date) => current is { } c && c > date ? c : date;
}

/// <summary>
/// Puts new runs on the runner's default pair, and reminds the runner (once per limit, on every device that allows
/// notifications) when a pair that asked for it reaches its limit.
/// </summary>
internal sealed class ShoeKeeper(IApplicationDbContext db, ShoeMileage mileage, NotificationDeliverer deliverer, TimeProvider time)
{
    /// <summary>How long a reminder may wait (quiet hours) before it's no longer worth sending.</summary>
    private static readonly TimeSpan ReminderLifetime = TimeSpan.FromDays(7);

    /// <summary>Adds the default pair to a new run, unless the run already has one. Doesn't save.</summary>
    public async Task WearDefaultAsync(Guid runnerId, Activity run, CancellationToken cancellationToken)
    {
        if (db.ShoeAssignments.Local.Any(a => a.ActivityId == run.Id)
            || await db.ShoeAssignments.AnyAsync(a => a.ActivityId == run.Id, cancellationToken))
        {
            return;
        }

        var shoe = await db.Shoes.AsNoTracking().SingleOrDefaultAsync(s => s.RunnerId == runnerId && s.IsDefault && s.RetiredAt == null, cancellationToken);
        if (shoe is not null)
        {
            db.ShoeAssignments.Add(ShoeAssignment.ForActivity(runnerId, shoe.Id, run.Id));
        }
    }

    /// <summary>A run was replaced by the same run from another source: its pair follows it. Doesn't save.</summary>
    public async Task<bool> FollowAsync(Guid fromActivityId, Guid toActivityId, CancellationToken cancellationToken)
    {
        var assignment = await db.ShoeAssignments.SingleOrDefaultAsync(a => a.ActivityId == fromActivityId, cancellationToken);
        assignment?.MoveToActivity(toActivityId);
        return assignment is not null;
    }

    /// <summary>Queues a reminder for every pair that has just reached its limit. Saves.</summary>
    public async Task RemindAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        var shoes = await db.Shoes.Where(s => s.RunnerId == runnerId && s.RemindAtLimit && s.RetiredAt == null).ToListAsync(cancellationToken);
        if (shoes.Count == 0)
        {
            return;
        }

        var totals = await mileage.ForRunnerAsync(runnerId, cancellationToken);
        var due = shoes.Where(s => s.ShouldRemind(s.StartingKm + (totals.TryGetValue(s.Id, out var t) ? t.Km : 0))).ToList();
        if (due.Count == 0)
        {
            return;
        }

        var now = time.GetUtcNow();
        var devices = await db.PushSubscriptions.Where(d => d.RunnerId == runnerId).ToListAsync(cancellationToken);
        foreach (var shoe in due)
        {
            foreach (var device in devices)
            {
                await deliverer.QueueAsync(device, NotificationKind.ShoeMileage, shoe.Id, $"{shoe.Id:N}:{shoe.LimitKm:0}", now, now + ReminderLifetime, cancellationToken);
            }

            // Marked whether or not a device was there to tell: the Shoes list shows the limit was passed either way.
            shoe.MarkReminded();
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}

internal static class ShoeViews
{
    public static ShoeDto From(Shoe shoe, ShoeMileage.Totals? totals)
    {
        var total = Math.Round(shoe.StartingKm + (totals?.Km ?? 0), 1);
        return new ShoeDto(
            shoe.Id, shoe.Name, shoe.StartingKm, shoe.LimitKm, total, totals?.Runs ?? 0, Math.Round(totals?.StravaKm ?? 0, 1),
            totals?.LastRunOn, shoe.IsDefault, shoe.RemindAtLimit, shoe.IsRetired, shoe.WearAt(total));
    }

    /// <summary>Which pair each of these runs was worn in.</summary>
    public static async Task<Dictionary<Guid, ShoeRefDto>> WornInAsync(IApplicationDbContext db, Guid runnerId, IReadOnlyCollection<Guid> activityIds, CancellationToken cancellationToken)
    {
        if (activityIds.Count == 0)
        {
            return [];
        }

        return await db.ShoeAssignments.AsNoTracking()
            .Where(a => a.RunnerId == runnerId && a.ActivityId != null && activityIds.Contains(a.ActivityId.Value))
            .Join(db.Shoes, a => a.ShoeId, s => s.Id, (a, s) => new { ActivityId = a.ActivityId!.Value, s.Id, s.Name })
            .ToDictionaryAsync(x => x.ActivityId, x => new ShoeRefDto(x.Id, x.Name), cancellationToken);
    }
}

internal sealed class SaveShoeValidator : AbstractValidator<SaveShoeRequest>
{
    public SaveShoeValidator()
    {
        RuleFor(r => r.Name).NotEmpty().WithMessage("Give the shoes a name.").MaximumLength(Shoe.MaxNameLength);
        RuleFor(r => r.StartingKm).InclusiveBetween(0, Shoe.MaxStartingKm);
        RuleFor(r => r.LimitKm).InclusiveBetween(Shoe.MinLimitKm, Shoe.MaxLimitKm);
    }
}

public sealed record ListMyShoesQuery : IRequest<IReadOnlyList<ShoeDto>>;

internal sealed class ListMyShoesHandler(IApplicationDbContext db, CurrentRunner current, ShoeMileage mileage) : IRequestHandler<ListMyShoesQuery, IReadOnlyList<ShoeDto>>
{
    public async Task<IReadOnlyList<ShoeDto>> Handle(ListMyShoesQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            return [];
        }

        var shoes = await db.Shoes.AsNoTracking().Where(s => s.RunnerId == runner.Id).ToListAsync(cancellationToken);
        var totals = await mileage.ForRunnerAsync(runner.Id, cancellationToken);
        return [.. shoes
            .OrderBy(s => s.IsRetired)
            .ThenByDescending(s => s.IsDefault)
            .ThenBy(s => s.Name, StringComparer.CurrentCultureIgnoreCase)
            .Select(s => ShoeViews.From(s, totals.GetValueOrDefault(s.Id)))];
    }
}

public sealed record CreateShoeCommand(SaveShoeRequest Shoe) : IRequest<ShoeDto>;

internal sealed class CreateShoeValidator : AbstractValidator<CreateShoeCommand>
{
    public CreateShoeValidator() => RuleFor(c => c.Shoe).NotNull().SetValidator(new SaveShoeValidator());
}

internal sealed class CreateShoeHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<CreateShoeCommand, ShoeDto>
{
    public async Task<ShoeDto> Handle(CreateShoeCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        if (await db.Shoes.CountAsync(s => s.RunnerId == runner.Id, cancellationToken) >= Shoe.MaxPerRunner)
        {
            throw new ConflictException("shoe_limit", $"You can keep up to {Shoe.MaxPerRunner} pairs. Delete an old pair to add another.");
        }

        var r = request.Shoe;
        var shoe = Shoe.Create(runner.Id, r.Name, r.StartingKm, r.LimitKm, r.RemindAtLimit);
        if (r.IsDefault)
        {
            await ClearDefaultAsync(db, runner.Id, cancellationToken);
            shoe.MakeDefault();
        }

        db.Shoes.Add(shoe);
        await db.SaveChangesAsync(cancellationToken);
        return ShoeViews.From(shoe, null);
    }

    public static async Task ClearDefaultAsync(IApplicationDbContext db, Guid runnerId, CancellationToken cancellationToken)
    {
        foreach (var other in await db.Shoes.Where(s => s.RunnerId == runnerId && s.IsDefault).ToListAsync(cancellationToken))
        {
            other.ClearDefault();
        }

        // Saved first: the database allows one default pair per runner at any moment.
        await db.SaveChangesAsync(cancellationToken);
    }
}

public sealed record UpdateShoeCommand(Guid Id, SaveShoeRequest Shoe) : IRequest<ShoeDto>;

internal sealed class UpdateShoeValidator : AbstractValidator<UpdateShoeCommand>
{
    public UpdateShoeValidator() => RuleFor(c => c.Shoe).NotNull().SetValidator(new SaveShoeValidator());
}

internal sealed class UpdateShoeHandler(IApplicationDbContext db, CurrentRunner current, ShoeMileage mileage, ShoeKeeper keeper, TimeProvider time)
    : IRequestHandler<UpdateShoeCommand, ShoeDto>
{
    public async Task<ShoeDto> Handle(UpdateShoeCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var shoe = await db.Shoes.SingleOrDefaultAsync(s => s.Id == request.Id && s.RunnerId == runner.Id, cancellationToken)
            ?? throw new NotFoundException("Shoe", request.Id.ToString());
        var r = request.Shoe;
        shoe.Edit(r.Name, r.StartingKm, r.LimitKm, r.RemindAtLimit);
        if (r.Retired)
        {
            shoe.Retire(time.GetUtcNow());
        }
        else
        {
            shoe.Return();
        }

        if (r.IsDefault && !shoe.IsDefault && !r.Retired)
        {
            await CreateShoeHandler.ClearDefaultAsync(db, runner.Id, cancellationToken);
            shoe.MakeDefault();
        }
        else if (!r.IsDefault)
        {
            shoe.ClearDefault();
        }

        await db.SaveChangesAsync(cancellationToken);
        // A lower limit (or kilometres already run) may have just been reached.
        await keeper.RemindAsync(runner.Id, cancellationToken);
        var totals = await mileage.ForRunnerAsync(runner.Id, cancellationToken);
        return ShoeViews.From(shoe, totals.GetValueOrDefault(shoe.Id));
    }
}

public sealed record DeleteShoeCommand(Guid Id) : IRequest<bool>;

internal sealed class DeleteShoeHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteShoeCommand, bool>
{
    public async Task<bool> Handle(DeleteShoeCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var shoe = await db.Shoes.SingleOrDefaultAsync(s => s.Id == request.Id && s.RunnerId == runner.Id, cancellationToken)
            ?? throw new NotFoundException("Shoe", request.Id.ToString());
        // Its assignments go with it (cascade); the runs themselves stay.
        db.Shoes.Remove(shoe);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }
}

/// <summary>Puts one run on a pair, moves it to another, or (with no pair) takes it off.</summary>
public sealed record WearShoeCommand(Guid? ShoeId, Guid? ActivityId, Guid? CheckInId) : IRequest<bool>;

internal sealed class WearShoeValidator : AbstractValidator<WearShoeCommand>
{
    public WearShoeValidator() =>
        RuleFor(c => c).Must(c => (c.ActivityId is null) != (c.CheckInId is null)).WithMessage("Choose one run.").OverridePropertyName("run");
}

internal sealed class WearShoeHandler(IApplicationDbContext db, CurrentRunner current, ShoeKeeper keeper, TimeProvider time) : IRequestHandler<WearShoeCommand, bool>
{
    public async Task<bool> Handle(WearShoeCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var (activityId, checkInId) = await RunsCheck.OwnedAsync(db, runner.Id, request.ActivityId, request.CheckInId, time.GetUtcNow(), cancellationToken);
        var existing = await db.ShoeAssignments.SingleOrDefaultAsync(
            a => a.RunnerId == runner.Id && (activityId != null ? a.ActivityId == activityId : a.CheckInId == checkInId), cancellationToken);

        if (request.ShoeId is not { } shoeId)
        {
            if (existing is not null)
            {
                db.ShoeAssignments.Remove(existing);
                await db.SaveChangesAsync(cancellationToken);
            }

            return true;
        }

        var shoe = await db.Shoes.AsNoTracking().SingleOrDefaultAsync(s => s.Id == shoeId && s.RunnerId == runner.Id, cancellationToken)
            ?? throw new NotFoundException("Shoe", shoeId.ToString());
        if (shoe.IsRetired)
        {
            throw new ConflictException("shoe_retired", "Those shoes are retired. Bring them back before adding runs.");
        }

        if (existing is null)
        {
            db.ShoeAssignments.Add(activityId is { } a ? ShoeAssignment.ForActivity(runner.Id, shoe.Id, a) : ShoeAssignment.ForCheckIn(runner.Id, shoe.Id, checkInId!.Value));
        }
        else
        {
            existing.MoveToShoe(shoe.Id);
        }

        await db.SaveChangesAsync(cancellationToken);
        await keeper.RemindAsync(runner.Id, cancellationToken);
        return true;
    }
}

/// <summary>Puts several past runs on one pair at once (runs already on a pair are left where they are).</summary>
public sealed record WearShoeOnRunsCommand(Guid ShoeId, IReadOnlyList<Guid> ActivityIds, IReadOnlyList<Guid> CheckInIds) : IRequest<int>;

internal sealed class WearShoeOnRunsValidator : AbstractValidator<WearShoeOnRunsCommand>
{
    public const int MaxPerRequest = 200;

    public WearShoeOnRunsValidator() =>
        RuleFor(c => c)
            .Must(c => (c.ActivityIds?.Count ?? 0) + (c.CheckInIds?.Count ?? 0) is > 0 and <= MaxPerRequest)
            .WithMessage($"Choose between 1 and {MaxPerRequest} runs.")
            .OverridePropertyName("runs");
}

internal sealed class WearShoeOnRunsHandler(IApplicationDbContext db, CurrentRunner current, ShoeKeeper keeper, TimeProvider time) : IRequestHandler<WearShoeOnRunsCommand, int>
{
    public async Task<int> Handle(WearShoeOnRunsCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var shoe = await db.Shoes.AsNoTracking().SingleOrDefaultAsync(s => s.Id == request.ShoeId && s.RunnerId == runner.Id, cancellationToken)
            ?? throw new NotFoundException("Shoe", request.ShoeId.ToString());
        if (shoe.IsRetired)
        {
            throw new ConflictException("shoe_retired", "Those shoes are retired. Bring them back before adding runs.");
        }

        var activityIds = (request.ActivityIds ?? []).Distinct().ToList();
        var checkInIds = (request.CheckInIds ?? []).Distinct().ToList();
        var ownedRuns = await db.Activities.Visible(time.GetUtcNow()).Where(a => a.RunnerId == runner.Id && activityIds.Contains(a.Id)).Select(a => a.Id).ToListAsync(cancellationToken);
        var plans = db.SavedPlans.Where(p => p.RunnerId == runner.Id).Select(p => p.Id);
        var ownedCheckIns = await db.SessionCheckIns.Where(c => checkInIds.Contains(c.Id) && plans.Contains(c.SavedPlanId) && c.DistanceKm != null)
            .Select(c => c.Id).ToListAsync(cancellationToken);
        var worn = await db.ShoeAssignments.Where(a => a.RunnerId == runner.Id
                && ((a.ActivityId != null && ownedRuns.Contains(a.ActivityId.Value)) || (a.CheckInId != null && ownedCheckIns.Contains(a.CheckInId.Value))))
            .Select(a => new { a.ActivityId, a.CheckInId })
            .ToListAsync(cancellationToken);

        var added = 0;
        foreach (var id in ownedRuns.Where(id => !worn.Any(w => w.ActivityId == id)))
        {
            db.ShoeAssignments.Add(ShoeAssignment.ForActivity(runner.Id, shoe.Id, id));
            added++;
        }

        foreach (var id in ownedCheckIns.Where(id => !worn.Any(w => w.CheckInId == id)))
        {
            db.ShoeAssignments.Add(ShoeAssignment.ForCheckIn(runner.Id, shoe.Id, id));
            added++;
        }

        await db.SaveChangesAsync(cancellationToken);
        await keeper.RemindAsync(runner.Id, cancellationToken);
        return added;
    }
}

/// <summary>Recent runs not on any pair yet (the last 90 days): uploads, synced runs, and runs checked in with a distance.</summary>
public sealed record ListRunsWithoutShoesQuery : IRequest<IReadOnlyList<UnassignedRunDto>>;

internal sealed class ListRunsWithoutShoesHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time)
    : IRequestHandler<ListRunsWithoutShoesQuery, IReadOnlyList<UnassignedRunDto>>
{
    public const int DaysBack = 90;

    public async Task<IReadOnlyList<UnassignedRunDto>> Handle(ListRunsWithoutShoesQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            return [];
        }

        var now = time.GetUtcNow();
        var from = DateOnly.FromDateTime(now.UtcDateTime).AddDays(-DaysBack);
        var worn = db.ShoeAssignments.Where(a => a.RunnerId == runner.Id);
        var runs = await db.Activities.AsNoTracking().Visible(now)
            .Where(a => a.RunnerId == runner.Id && a.LocalDate >= from && !worn.Any(w => w.ActivityId == a.Id))
            .ToListAsync(cancellationToken);
        var plans = db.SavedPlans.Where(p => p.RunnerId == runner.Id).Select(p => p.Id);
        var runIds = runs.Select(r => r.Id).ToHashSet();
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => plans.Contains(c.SavedPlanId) && c.Date >= from && c.DistanceKm != null && c.Status != CheckInStatus.Skipped
                && !worn.Any(w => w.CheckInId == c.Id))
            .ToListAsync(cancellationToken);
        // A check-in linked to a run is that run: the run is the one listed (and worn).
        var linkedRuns = await db.Activities.AsNoTracking().Visible(now).Where(a => a.RunnerId == runner.Id).Select(a => a.Id).ToListAsync(cancellationToken);

        return [.. runs
            .Select(r => new UnassignedRunDto(r.Id, null, r.LocalDate, ActivitySummaryDto.Round(r.DistanceKm, 2), r.PlannedSession?.Title ?? "Run", r.Source.ToString()))
            .Concat(checkIns
                .Where(c => c.ActivityId is not { } linked || !linkedRuns.Contains(linked))
                .Select(c => new UnassignedRunDto(null, c.Id, c.Date, ActivitySummaryDto.Round(c.DistanceKm!.Value, 2), (c.ActualSessionType ?? c.SessionType).ToString(), "CheckIn")))
            .Where(r => r.ActivityId is null || runIds.Contains(r.ActivityId.Value))
            .OrderByDescending(r => r.Date)];
    }
}

/// <summary>Makes sure a run or check-in belongs to the runner, and turns a check-in linked to a run into that run.</summary>
internal static class RunsCheck
{
    public static async Task<(Guid? ActivityId, Guid? CheckInId)> OwnedAsync(
        IApplicationDbContext db, Guid runnerId, Guid? activityId, Guid? checkInId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (activityId is { } a)
        {
            return await db.Activities.Visible(now).AnyAsync(r => r.Id == a && r.RunnerId == runnerId, cancellationToken)
                ? (a, null)
                : throw new NotFoundException("Activity", a.ToString());
        }

        var plans = db.SavedPlans.Where(p => p.RunnerId == runnerId).Select(p => p.Id);
        var checkIn = await db.SessionCheckIns.AsNoTracking()
            .SingleOrDefaultAsync(c => c.Id == checkInId && plans.Contains(c.SavedPlanId), cancellationToken)
            ?? throw new NotFoundException("Check-in", checkInId.ToString()!);
        if (checkIn.ActivityId is { } linked && await db.Activities.Visible(now).AnyAsync(r => r.Id == linked && r.RunnerId == runnerId, cancellationToken))
        {
            return (linked, null);
        }

        return checkIn.DistanceKm is null
            ? throw new ConflictException("no_distance", "That run has no distance, so it can't add kilometres to a pair. Add its distance first.")
            : (null, checkIn.Id);
    }
}
