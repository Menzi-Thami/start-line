using System.Globalization;
using System.Text;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.Sync;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Sync;

namespace StartLine.Application.Features.Activities;

/// <summary>Where the runner's runs came from: uploads by file format, synced copies, and the Strava connection.</summary>
public sealed record RunSourcesDto(
    int Uploads,
    int Fit,
    int Gpx,
    int Tcx,
    int UnknownFormat,
    int Strava,
    bool StravaConnected,
    ConnectionStatus? StravaStatus,
    DateTimeOffset? LastSyncedAt,
    int StravaPending);

/// <summary>
/// A total and exactly what makes it up: kilometres and runs from check-ins the runner entered, from uploaded files
/// and from Strava, and how many counted runs had no distance at all.
/// </summary>
public sealed record TotalsBreakdownDto(
    string Period,
    DateOnly From,
    DateOnly To,
    double TotalKm,
    int Runs,
    double TickedKm,
    int TickedRuns,
    double UploadedKm,
    int UploadedRuns,
    double StravaKm,
    int StravaRuns,
    int WithoutDistance);

/// <summary>Two runs that may be the same one. <see cref="RunRelation.SameRun"/> pairs are almost certainly duplicates.</summary>
public sealed record PossibleDuplicateDto(ActivitySummaryDto First, ActivitySummaryDto Second, RunRelation Relation);

/// <summary>How many runs are missing each measurement, so gaps in charts and comparisons can be explained.</summary>
public sealed record MissingDataDto(int Runs, int WithoutHeartRate, int WithoutElevation, int WithoutSplits, bool HeartRateConsent);

/// <summary>A run from Strava that didn't arrive: failed after retries (can be retried) or deliberately skipped (with why).</summary>
public sealed record SyncIssueDto(long StravaActivityId, string Reason, bool Skipped, DateTimeOffset At);

public sealed record RunDataDto(
    RunSourcesDto Sources,
    IReadOnlyList<TotalsBreakdownDto> Totals,
    IReadOnlyList<PossibleDuplicateDto> PossibleDuplicates,
    MissingDataDto Missing,
    IReadOnlyList<SyncIssueDto> SyncIssues);

/// <summary>Everything the runner needs to trust their numbers: sources, the make-up of this week's and month's totals,
/// possible duplicates, missing measurements and runs that didn't sync.</summary>
public sealed record GetRunDataQuery : IRequest<RunDataDto>;

internal sealed class GetRunDataHandler(IApplicationDbContext db, CurrentRunner current, RunningLogReader reader, TimeProvider time)
    : IRequestHandler<GetRunDataQuery, RunDataDto>
{
    public async Task<RunDataDto> Handle(GetRunDataQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var now = time.GetUtcNow();
        var runs = await db.Activities.AsNoTracking().Visible(now)
            .Where(a => a.RunnerId == runner.Id)
            .OrderBy(a => a.StartedAt)
            .ToListAsync(cancellationToken);
        var connection = await db.ProviderConnections.AsNoTracking()
            .SingleOrDefaultAsync(c => c.RunnerId == runner.Id && c.Provider == SyncProvider.Strava, cancellationToken);
        var jobs = await db.SyncJobs.AsNoTracking()
            .Where(j => j.RunnerId == runner.Id && j.Provider == SyncProvider.Strava)
            .ToListAsync(cancellationToken);

        var uploads = runs.Where(a => a.Source == ActivitySource.Upload).ToList();
        var sources = new RunSourcesDto(
            uploads.Count,
            uploads.Count(a => a.Format == RecordingFormat.Fit),
            uploads.Count(a => a.Format == RecordingFormat.Gpx),
            uploads.Count(a => a.Format == RecordingFormat.Tcx),
            uploads.Count(a => a.Format is null),
            runs.Count(a => a.Source == ActivitySource.Strava),
            connection is not null,
            connection?.Status,
            connection?.LastSyncedAt,
            jobs.Count(j => !j.Failed && j.Kind == SyncJobKind.FetchActivity));

        var today = CoachCalls.LocalToday(runner, time);
        var weekStart = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var log = await reader.ReadAsync(runner, monthStart < weekStart ? monthStart : weekStart, today, includeSynced: true, cancellationToken);
        TotalsBreakdownDto Breakdown(string period, DateOnly from)
        {
            var inPeriod = log.Where(r => r.Date >= from && r.Date <= today).ToList();
            double Km(LoggedRunSource source) => ActivitySummaryDto.Round(inPeriod.Where(r => r.Source == source).Sum(r => r.DistanceKm), 2);
            int Count(LoggedRunSource source) => inPeriod.Count(r => r.Source == source);
            return new TotalsBreakdownDto(
                period, from, today, ActivitySummaryDto.Round(inPeriod.Sum(r => r.DistanceKm), 2), inPeriod.Count,
                Km(LoggedRunSource.Ticked), Count(LoggedRunSource.Ticked),
                Km(LoggedRunSource.Uploaded), Count(LoggedRunSource.Uploaded),
                Km(LoggedRunSource.Strava), Count(LoggedRunSource.Strava),
                inPeriod.Count(r => r.DistanceUnreported));
        }

        var dismissed = (await db.DuplicateDismissals.AsNoTracking()
                .Where(d => d.RunnerId == runner.Id)
                .Select(d => new { d.FirstActivityId, d.SecondActivityId })
                .ToListAsync(cancellationToken))
            .Select(d => (d.FirstActivityId, d.SecondActivityId))
            .ToHashSet();

        var missing = new MissingDataDto(
            runs.Count,
            runs.Count(a => a.AverageHeartRate is null),
            runs.Count(a => a.ElevationGainMetres is null),
            runs.Count(a => a.Splits.Count == 0),
            runner.HeartRateConsent);

        var issues = jobs
            .Where(j => j.Failed && j.Kind == SyncJobKind.FetchActivity && j.ObjectId is not null)
            .OrderByDescending(j => j.CreatedAt)
            .Select(j => new SyncIssueDto(j.ObjectId!.Value, j.LastError ?? "Strava didn't send this run.", j.Skipped, j.CreatedAt))
            .ToList();

        return new RunDataDto(
            sources,
            [Breakdown("week", weekStart), Breakdown("month", monthStart)],
            [.. PossibleDuplicates(runs, dismissed)],
            missing,
            issues);
    }

    /// <summary>
    /// Pairs of runs that overlap in time, or are the same run recorded twice, that the runner hasn't said to keep.
    /// The runs are in start order, so each is only compared with the ones that start before it has finished.
    /// </summary>
    private static IEnumerable<PossibleDuplicateDto> PossibleDuplicates(List<Activity> runs, HashSet<(Guid, Guid)> dismissed)
    {
        for (var i = 0; i < runs.Count; i++)
        {
            var first = runs[i];
            var reach = first.StartedAt + first.ElapsedTime + RunMatch.SameStartWithin;
            for (var j = i + 1; j < runs.Count && runs[j].StartedAt <= reach; j++)
            {
                var second = runs[j];
                var relation = RunMatch.Compare(first, second);
                if (relation != RunRelation.Unrelated && !dismissed.Contains(DuplicateDismissal.Order(first.Id, second.Id)))
                {
                    yield return new PossibleDuplicateDto(ActivitySummaryDto.From(first), ActivitySummaryDto.From(second), relation);
                }
            }
        }
    }
}

/// <summary>Tries again every run from Strava that failed after its retries. Returns how many were queued.</summary>
public sealed record RetryStravaFetchesCommand : IRequest<int>;

internal sealed class RetryStravaFetchesHandler(IApplicationDbContext db, CurrentRunner current, ISyncSignal signal, TimeProvider time)
    : IRequestHandler<RetryStravaFetchesCommand, int>
{
    public async Task<int> Handle(RetryStravaFetchesCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var connection = await db.ProviderConnections
            .SingleOrDefaultAsync(c => c.RunnerId == runner.Id && c.Provider == SyncProvider.Strava, cancellationToken);
        if (connection is null || connection.Status != ConnectionStatus.Active)
        {
            throw new ConflictException("strava_not_connected", "Connect Strava again before retrying: Taperday can't reach your runs until you do.");
        }

        var failed = await db.SyncJobs
            .Where(j => j.RunnerId == runner.Id && j.Provider == SyncProvider.Strava && j.Kind == SyncJobKind.FetchActivity && j.Failed && !j.Skipped)
            .ToListAsync(cancellationToken);
        var now = time.GetUtcNow();
        foreach (var job in failed)
        {
            job.Retry(now);
        }

        await db.SaveChangesAsync(cancellationToken);
        if (failed.Count > 0)
        {
            signal.Wake();
        }

        return failed.Count;
    }
}

/// <summary>The runner says two overlapping runs are both real: stop flagging that pair.</summary>
public sealed record KeepBothRunsCommand(Guid FirstActivityId, Guid SecondActivityId) : IRequest<bool>;

internal sealed class KeepBothRunsHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time) : IRequestHandler<KeepBothRunsCommand, bool>
{
    public async Task<bool> Handle(KeepBothRunsCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.RequireConsentedAsync(cancellationToken);
        var ids = new[] { request.FirstActivityId, request.SecondActivityId };
        var owned = await db.Activities.CountAsync(a => a.RunnerId == runner.Id && ids.Contains(a.Id), cancellationToken);
        if (owned != 2 || request.FirstActivityId == request.SecondActivityId)
        {
            throw new NotFoundException("Activity pair", $"{request.FirstActivityId},{request.SecondActivityId}");
        }

        var (first, second) = DuplicateDismissal.Order(request.FirstActivityId, request.SecondActivityId);
        if (!await db.DuplicateDismissals.AnyAsync(d => d.RunnerId == runner.Id && d.FirstActivityId == first && d.SecondActivityId == second, cancellationToken))
        {
            db.DuplicateDismissals.Add(DuplicateDismissal.Of(runner.Id, first, second, time.GetUtcNow()));
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }
}

/// <summary>Deletes several of the runner's runs at once (duplicates, a bad import). Returns how many were deleted.</summary>
public sealed record DeleteMyActivitiesCommand(IReadOnlyList<Guid> ActivityIds) : IRequest<int>;

internal sealed class DeleteMyActivitiesValidator : AbstractValidator<DeleteMyActivitiesCommand>
{
    public const int MaxPerRequest = 100;

    public DeleteMyActivitiesValidator()
    {
        RuleFor(c => c.ActivityIds)
            .NotEmpty().WithMessage("Choose at least one run to delete.")
            .Must(ids => ids is { Count: <= MaxPerRequest }).WithMessage($"Delete up to {MaxPerRequest} runs at a time.")
            .OverridePropertyName("activityIds");
    }
}

internal sealed class DeleteMyActivitiesHandler(IApplicationDbContext db, CurrentRunner current) : IRequestHandler<DeleteMyActivitiesCommand, int>
{
    public async Task<int> Handle(DeleteMyActivitiesCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var ids = request.ActivityIds.Distinct().ToList();
        // Only the runner's own: someone else's ids are ignored, never confirmed to exist.
        var runs = await db.Activities.Where(a => a.RunnerId == runner.Id && ids.Contains(a.Id)).ToListAsync(cancellationToken);
        db.Activities.RemoveRange(runs);
        await db.SaveChangesAsync(cancellationToken);
        return runs.Count;
    }
}

/// <summary>Every run the runner can see as a spreadsheet: one row per run, with where it came from.</summary>
public sealed record ExportMyRunsQuery : IRequest<string>;

internal sealed class ExportMyRunsHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time) : IRequestHandler<ExportMyRunsQuery, string>
{
    public static readonly string[] Columns =
    [
        "date", "started_at_utc", "source", "file_format", "file_name", "strava_activity_id", "fetched_at_utc", "cached_until_utc",
        "distance_km", "moving_time_s", "elapsed_time_s", "elevation_gain_m", "average_heart_rate", "max_heart_rate", "planned_session",
    ];

    public async Task<string> Handle(ExportMyRunsQuery request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        var runs = await db.Activities.AsNoTracking().Visible(time.GetUtcNow())
            .Where(a => a.RunnerId == runner.Id)
            .OrderBy(a => a.StartedAt)
            .ToListAsync(cancellationToken);

        var csv = new StringBuilder();
        csv.AppendLine(string.Join(',', Columns));
        foreach (var run in runs)
        {
            string?[] cells =
            [
                run.LocalDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                run.StartedAt.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
                run.Source.ToString(),
                run.Format?.ToString(),
                run.FileName,
                run.ExternalId,
                run.FetchedAt?.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
                run.CachedUntil?.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
                Math.Round(run.DistanceKm, 3).ToString(CultureInfo.InvariantCulture),
                Math.Round(run.MovingTime.TotalSeconds).ToString(CultureInfo.InvariantCulture),
                Math.Round(run.ElapsedTime.TotalSeconds).ToString(CultureInfo.InvariantCulture),
                run.ElevationGainMetres is { } gain ? Math.Round(gain).ToString(CultureInfo.InvariantCulture) : null,
                run.AverageHeartRate?.ToString(CultureInfo.InvariantCulture),
                run.MaxHeartRate?.ToString(CultureInfo.InvariantCulture),
                run.PlannedSession?.Title,
            ];
            csv.AppendLine(string.Join(',', cells.Select(Cell)));
        }

        return csv.ToString();
    }

    /// <summary>
    /// One CSV cell: quoted when it holds a comma, quote or line break, and with a leading apostrophe when it starts like a
    /// formula (=, +, -, @), so a file name can never run as a formula when the export is opened in a spreadsheet.
    /// </summary>
    public static string Cell(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        if (value[0] is '=' or '+' or '-' or '@' or '\t' or '\r')
        {
            value = "'" + value;
        }

        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"" : value;
    }
}
