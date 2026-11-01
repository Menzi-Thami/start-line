using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Domain.Coaching;

namespace StartLine.Application.Features.Activities;

/// <summary>A saved or currently available run; synced measurements carry their cache deadline.</summary>
public sealed record LoggedRunDto(DateOnly Date, double DistanceKm, LoggedRunSource Source, bool DistanceUnreported = false, DateTimeOffset? CachedUntil = null);

/// <summary>
/// The runs behind Home's "Your running" totals, from the 1st of January (or further back, for the last 12 weeks and last
/// month). By default it returns saved history; IncludeSynced adds available imports for a transient current view.
/// </summary>
/// <param name="AllTime">Every kept run since the runner started, for the all-time totals, instead of this year and 13 weeks.</param>
public sealed record GetRunningLogQuery(bool IncludeSynced = false, bool AllTime = false) : IRequest<IReadOnlyList<LoggedRunDto>>;

internal sealed class GetRunningLogHandler(CurrentRunner current, RunningLogReader reader, TimeProvider time)
    : IRequestHandler<GetRunningLogQuery, IReadOnlyList<LoggedRunDto>>
{
    /// <summary>Twelve full weeks and this one, for the weekly chart.</summary>
    public const int WeeksBack = 13;

    public async Task<IReadOnlyList<LoggedRunDto>> Handle(GetRunningLogQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var today = CoachCalls.LocalToday(runner, time);
        var from = request.AllTime ? DateOnly.MinValue : Earliest(new DateOnly(today.Year, 1, 1), new DateOnly(today.Year, today.Month, 1).AddMonths(-1), today.AddDays(-7 * WeeksBack));
        var log = await reader.ReadAsync(runner, from, today, request.IncludeSynced, cancellationToken);
        return [.. log.Select(r => new LoggedRunDto(r.Date, ActivitySummaryDto.Round(r.DistanceKm, 2), r.Source, r.DistanceUnreported, r.CachedUntil))];
    }

    private static DateOnly Earliest(params DateOnly[] dates) => dates.Min();
}
