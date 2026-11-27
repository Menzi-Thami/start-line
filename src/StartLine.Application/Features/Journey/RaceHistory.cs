using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Races;
using StartLine.Domain.Journey;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Journey;

public sealed record RaceMemoryDto(string EventName, double? EventDistanceKm, MarathonMajor? Major, bool MajorEligible, RaceResultDto Result, bool NeedsReview = false);
public sealed record RaceHistoryDto(IReadOnlyList<RaceMemoryDto> Races, IReadOnlyList<MarathonMajorDefinition> Majors);

public sealed record SaveRaceMemoryRequest(
    string EventName, double EventDistanceKm, DateOnly RaceDate, RaceOutcome Outcome,
    TimeSpan? FinishTime = null, double? DistanceKm = null, Guid? ActivityId = null, string? Note = null,
    RaceTimeKind TimeKind = RaceTimeKind.Unspecified, MarathonMajor? Major = null, string? ExpectedVersion = null);

/// <summary>Reads race results without generating training schedules. A race remains a memory even without a plan or recording.</summary>
internal sealed class RaceHistoryReader(IApplicationDbContext db, IRaceCatalogue catalogue)
{
    public async Task<IReadOnlyList<RaceMemoryDto>> ReadAsync(Guid runnerId, CancellationToken cancellationToken, DateOnly? on = null)
    {
        var results = await db.RaceResults.AsNoTracking().Where(r => r.RunnerId == runnerId && (on == null || r.RaceDate == on))
            .OrderByDescending(r => r.RaceDate).ThenByDescending(r => r.UpdatedAt).ThenByDescending(r => r.Id).ToListAsync(cancellationToken);
        var ids = results.Where(r => r.SavedPlanId != null).Select(r => r.SavedPlanId!.Value).ToList();
        var plans = await db.SavedPlans.AsNoTracking().Where(p => p.RunnerId == runnerId && ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, cancellationToken);
        return [.. results.Select(r => View(r, r.SavedPlanId is { } id ? plans.GetValueOrDefault(id) : null))];
    }

    public RaceMemoryDto View(RaceResult result, SavedPlan? plan = null)
    {
        var race = plan?.Inputs.RaceSlug is { } slug ? catalogue.FindBySlug(slug) : null;
        var name = !string.IsNullOrWhiteSpace(result.EventName) ? result.EventName : plan?.Inputs.RaceName ?? race?.Name ?? plan?.Name ?? "Past race";
        var km = result.EventDistanceKm ?? plan?.Inputs.DistanceKm ?? race?.Distance.Kilometres;
        var major = result.Major ?? (km is { } distance ? MarathonMajors.Recognise(name, distance) : null);
        return new RaceMemoryDto(name, km, major,
            result.Outcome == RaceOutcome.Finished && km is { } marathon && MarathonMajors.IsMarathon(marathon) && MarathonMajors.Qualifies(major, result.RaceDate),
            RaceResultDto.From(result, plan?.Inputs.GoalTime));
    }

    public async Task EnsureUniqueAsync(RaceResult result, CancellationToken cancellationToken)
    {
        var others = await ReadAsync(result.RunnerId, cancellationToken, result.RaceDate);
        if (others.Any(other => other.Result.Id != result.Id
            && (result.SavedPlanId is null || other.Result.PlanId != result.SavedPlanId) && Identity(other) == result.RaceKey))
            throw new ConflictException("race_already_recorded", "This race is already in your history. Open its saved result to correct it.");
        if (result.ActivityId is { } activityId && await db.RaceResults.AsNoTracking()
            .AnyAsync(r => r.RunnerId == result.RunnerId && r.Id != result.Id && r.ActivityId == activityId
                && (result.SavedPlanId == null || r.SavedPlanId != result.SavedPlanId), cancellationToken))
            throw new ConflictException("race_recording_used", "This recording is already linked to a race result. Open that result to correct it.");
    }

    public static string Identity(RaceMemoryDto memory) => memory.EventDistanceKm is { } km
        ? MarathonMajors.RaceKey(memory.EventName, km, memory.Result.RaceDate, memory.Major) : memory.Result.Id.ToString();
}

public sealed record GetRaceHistoryQuery : IRequest<RaceHistoryDto>;
internal sealed class GetRaceHistoryHandler(CurrentRunner current, RaceHistoryReader reader) : IRequestHandler<GetRaceHistoryQuery, RaceHistoryDto>
{
    public async Task<RaceHistoryDto> Handle(GetRaceHistoryQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        var races = runner is null ? [] : await reader.ReadAsync(runner.Id, cancellationToken);
        // Older releases could attach the same event to different plans. Do not silently pick a result or award twice.
        // Keep every original available for review; removing an incorrect result never removes its training chapter.
        var duplicates = races.GroupBy(RaceHistoryReader.Identity).Where(g => g.Count() > 1).SelectMany(g => g.Select(r => r.Result.Id)).ToHashSet();
        return new RaceHistoryDto([.. races.Select(r => duplicates.Contains(r.Result.Id) ? r with { NeedsReview = true, MajorEligible = false } : r)], MarathonMajors.All);
    }
}

public sealed record SaveRaceMemoryCommand(Guid Id, SaveRaceMemoryRequest Race) : IRequest<RaceMemoryDto>;
internal sealed class SaveRaceMemoryValidator : AbstractValidator<SaveRaceMemoryCommand>
{
    public SaveRaceMemoryValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Race).NotNull();
        When(c => c.Race is not null, () =>
        {
            RuleFor(c => c.Race.EventName).NotEmpty().MaximumLength(RaceResult.MaxEventNameLength);
            RuleFor(c => c.Race.EventDistanceKm).InclusiveBetween(RaceResult.MinDistanceKm, RaceResult.MaxDistanceKm);
            RuleFor(c => c.Race.Outcome).IsInEnum();
            RuleFor(c => c.Race.TimeKind).IsInEnum();
            RuleFor(c => c.Race.Note).MaximumLength(RaceResult.MaxNoteLength);
            RuleFor(c => c.Race.ExpectedVersion).MaximumLength(64);
        });
    }
}

internal sealed class SaveRaceMemoryHandler(IApplicationDbContext db, CurrentRunner current, RaceHistoryReader reader, PlanBuilder builder, TimeProvider time)
    : IRequestHandler<SaveRaceMemoryCommand, RaceMemoryDto>
{
    public async Task<RaceMemoryDto> Handle(SaveRaceMemoryCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var r = request.Race;
        var today = CoachCalls.LocalToday(runner, time);
        var existing = await db.RaceResults.SingleOrDefaultAsync(x => x.Id == request.Id && x.RunnerId == runner.Id, cancellationToken);
        var plan = existing?.SavedPlanId is { } planId ? await OwnJourney.PlanAsync(db, runner, planId, cancellationToken) : null;
        if (r.ExpectedVersion is not null && (existing is null || !JourneyVersion.Matches(r.ExpectedVersion, existing.Version)))
            throw Changed();
        if (existing is not null && r.ExpectedVersion is null)
        {
            // The same client-generated id makes an acknowledged or lost-response retry idempotent, never an unversioned edit.
            if (Same(existing, r)) return reader.View(existing, plan);
            throw Changed();
        }
        if (r.ActivityId is { } activity && existing?.ActivityId != activity
            && !await db.Activities.Visible(time.GetUtcNow()).AnyAsync(a => a.Id == activity && a.RunnerId == runner.Id, cancellationToken))
            throw new NotFoundException("Activity", activity.ToString());
        var answers = new RaceResultAnswers(r.Outcome, r.RaceDate, r.FinishTime, r.DistanceKm, r.ActivityId, r.Note);
        var result = existing ?? RaceResult.RecordPast(request.Id, runner.Id, answers, today);
        if (existing is not null)
        {
            // Retained legacy results can still be corrected when the source catalogue has gone.
            var start = plan is null ? new DateOnly(1900, 1, 1) : plan.Inputs.HasRaceSnapshot
                ? builder.BuildPlan(plan, paceDate: today).StartDate : plan.Inputs.PlanFrom;
            result.Change(answers, start, today);
        }
        result.Identify(r.EventName, r.EventDistanceKm, r.Major, r.TimeKind);
        await reader.EnsureUniqueAsync(result, cancellationToken);
        if (existing is null) db.RaceResults.Add(result);
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateException)
        {
            db.RaceResults.Entry(result).State = EntityState.Detached;
            var latest = await db.RaceResults.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.Id && x.RunnerId == runner.Id, cancellationToken);
            if (r.ExpectedVersion is null && latest is not null && Same(latest, r)) return reader.View(latest, plan);
            await reader.EnsureUniqueAsync(result, cancellationToken);
            if (latest is not null || await db.RaceResults.AsNoTracking().AnyAsync(x => x.Id == request.Id, cancellationToken)) throw Changed();
            throw;
        }
        await RaceAchievements.FollowAsync(db, runner.Id, result, time.GetUtcNow(), cancellationToken);
        return reader.View(result, plan);
    }

    private static bool Same(RaceResult result, SaveRaceMemoryRequest r) =>
        result.EventName == r.EventName.Trim() && result.EventDistanceKm == r.EventDistanceKm
        && result.Major == (r.Major ?? MarathonMajors.Recognise(r.EventName, r.EventDistanceKm))
        && result.Outcome == r.Outcome && result.RaceDate == r.RaceDate && Seconds(result.FinishTime) == Seconds(r.FinishTime)
        && result.DistanceKm == (r.DistanceKm is { } km ? Math.Round(km, 2) : null)
        && result.ActivityId == r.ActivityId && result.Note == (string.IsNullOrWhiteSpace(r.Note) ? null : r.Note.Trim())
        && result.TimeKind == (r.FinishTime is null ? RaceTimeKind.Unspecified : r.TimeKind);

    private static ConflictException Changed() => new("race_result_changed", "Your race result changed on another device. Load it again before saving.");

    // The existing storage contract keeps whole seconds, including for a retry carrying fractional input.
    private static long? Seconds(TimeSpan? time) => time is { } value ? (long)value.TotalSeconds : null;
}

public sealed record DeleteRaceMemoryCommand(Guid Id, string ExpectedVersion) : IRequest<bool>;
internal sealed class DeleteRaceMemoryHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteRaceMemoryCommand, bool>
{
    public async Task<bool> Handle(DeleteRaceMemoryCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var result = await db.RaceResults.SingleOrDefaultAsync(r => r.Id == request.Id && r.RunnerId == runner.Id, cancellationToken)
            ?? throw new NotFoundException("Race result", request.Id.ToString());
        if (string.IsNullOrEmpty(request.ExpectedVersion) || !JourneyVersion.Matches(request.ExpectedVersion, result.Version))
            throw new ConflictException("race_result_changed", "Your race result changed. Load it again before removing it.");
        // One SaveChanges transaction removes both. A concurrent result edit rolls the badge removal back as well.
        db.RaceResults.Remove(result);
        if (result.SavedPlanId is { } planId)
        {
            var awards = await db.Achievements.Where(a => a.RunnerId == runner.Id && a.SavedPlanId == planId && a.Kind == AchievementKind.RaceFinished).ToListAsync(cancellationToken);
            db.Achievements.RemoveRange(awards);
        }
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateConcurrencyException) { throw new ConflictException("race_result_changed", "Your race result changed. Load it again before removing it."); }
        return true;
    }
}
