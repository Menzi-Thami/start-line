using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Domain.Coaching;

namespace StartLine.Application.Features.Coaching;

/// <summary>How the runner felt on one day, as they logged it.</summary>
public sealed record ReadinessDto(DateOnly Date, Feeling Feeling, SleepQuality? Sleep, Soreness? Soreness, string? Note, DateTimeOffset UpdatedAt)
{
    public static ReadinessDto From(DailyReadiness r)
    {
        ArgumentNullException.ThrowIfNull(r);
        return new(r.Date, r.Feeling, r.Sleep, r.Soreness, r.Note, r.UpdatedAt);
    }
}

/// <summary>The runner's check-ins over the last <paramref name="Days"/> days (1–60), newest first.</summary>
public sealed record ListMyReadinessQuery(int Days = DailyReadiness.EditableDays) : IRequest<IReadOnlyList<ReadinessDto>>;

internal sealed class ListMyReadinessHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time)
    : IRequestHandler<ListMyReadinessQuery, IReadOnlyList<ReadinessDto>>
{
    public const int MaxDays = 60;

    public async Task<IReadOnlyList<ReadinessDto>> Handle(ListMyReadinessQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken);
        if (runner is null)
        {
            return [];
        }

        var today = CoachCalls.LocalToday(runner, time);
        var from = today.AddDays(-(Math.Clamp(request.Days, 1, MaxDays) - 1));
        var days = await db.Readiness.AsNoTracking()
            .Where(r => r.RunnerId == runner.Id && r.Date >= from && r.Date <= today)
            .OrderByDescending(r => r.Date)
            .ToListAsync(cancellationToken);
        return [.. days.Select(ReadinessDto.From)];
    }
}

/// <summary>Logs or changes how the runner felt on a day: today, or one of the 13 before.</summary>
public sealed record LogReadinessCommand(DateOnly Date, Feeling Feeling, SleepQuality? Sleep = null, Soreness? Soreness = null, string? Note = null) : IRequest<ReadinessDto>;

internal sealed class LogReadinessHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time)
    : IRequestHandler<LogReadinessCommand, ReadinessDto>
{
    public async Task<ReadinessDto> Handle(LogReadinessCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var today = CoachCalls.LocalToday(runner, time);
        var now = time.GetUtcNow();
        var day = await db.Readiness.SingleOrDefaultAsync(r => r.RunnerId == runner.Id && r.Date == request.Date, cancellationToken);
        if (day is null)
        {
            day = DailyReadiness.Log(runner.Id, request.Date, today, request.Feeling, request.Sleep, request.Soreness, request.Note, now);
            db.Readiness.Add(day);
        }
        else
        {
            day.Change(today, request.Feeling, request.Sleep, request.Soreness, request.Note, now);
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            throw new ConflictException("readiness_changed", "That day changed on another device. Load it again and try once more.");
        }

        return ReadinessDto.From(day);
    }
}

/// <summary>Clears a day's check-in. Clearing a day with none is fine.</summary>
public sealed record ClearReadinessCommand(DateOnly Date) : IRequest<bool>;

internal sealed class ClearReadinessHandler(IApplicationDbContext db, CurrentRunner current)
    : IRequestHandler<ClearReadinessCommand, bool>
{
    public async Task<bool> Handle(ClearReadinessCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        await db.Readiness.Where(r => r.RunnerId == runner.Id && r.Date == request.Date).ExecuteDeleteAsync(cancellationToken);
        return true;
    }
}

/// <summary>What the weekly review hears from the runner's own check-ins when they don't answer there.</summary>
internal static class ReadinessForReview
{
    /// <summary>Today's check-in, or yesterday's: anything older says little about the week ahead. Null without one.</summary>
    public static async Task<RecoveryReadiness?> LatestAsync(IApplicationDbContext db, Guid runnerId, DateOnly today, CancellationToken cancellationToken)
    {
        var latest = await db.Readiness.AsNoTracking()
            .Where(r => r.RunnerId == runnerId && r.Date >= today.AddDays(-1) && r.Date <= today)
            .OrderByDescending(r => r.Date)
            .FirstOrDefaultAsync(cancellationToken);
        // "Okay" says nothing either way, so the review carries on as if unanswered.
        return latest is null || DailyReadiness.ReadinessFor(latest.Feeling) == RecoveryReadiness.NotReported ? null : DailyReadiness.ReadinessFor(latest.Feeling);
    }
}
