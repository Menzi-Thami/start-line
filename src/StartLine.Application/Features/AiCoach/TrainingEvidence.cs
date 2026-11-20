using Microsoft.EntityFrameworkCore;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.Coaching;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.AiCoach;

/// <summary>Where a run's numbers came from: what the runner typed in a check-in, or a file they uploaded.</summary>
public enum EvidenceSource { CheckIn, Upload }

/// <summary>
/// One run the coach may use. A check-in on an uploaded run is one entry, with the file's numbers and the runner's own
/// answers, so nothing counts twice. No heart rate, no route, no ids: the coach needs none of them.
/// </summary>
public sealed record EvidenceRunDto(
    DateOnly Date,
    EvidenceSource Source,
    SessionType? PlannedType,
    CheckInStatus? Status,
    double? DistanceKm,
    int? MovingMinutes,
    double? PaceSecondsPerKm,
    int? Effort,
    PainLevel? Pain);

/// <summary>
/// The runner's own training the coach may use: their check-ins and their uploaded files from the last
/// <see cref="TrainingEvidence.Days"/> days. <c>ExcludedLinkedRuns</c> counts check-ins left out because they're linked to a
/// run that isn't an upload (a Strava run, or one whose source isn't known), so the coach can say it didn't see them.
/// </summary>
public sealed record TrainingEvidenceDto(DateOnly From, DateOnly To, IReadOnlyList<EvidenceRunDto> Runs, int ExcludedLinkedRuns)
{
    public int CheckIns => Runs.Count(r => r.Source == EvidenceSource.CheckIn);

    public int Uploads => Runs.Count(r => r.Source == EvidenceSource.Upload);

    public double Km => Math.Round(Runs.Where(r => r.Status != CheckInStatus.Skipped).Sum(r => r.DistanceKm ?? 0), 1);
}

/// <summary>
/// The only door from a runner's training into the AI coach and the MCP tools. Strava's API policy doesn't allow its data in an
/// AI model or a third-party MCP server, so a synced Strava run never passes, and neither does a check-in linked to one, even
/// with numbers the runner typed: when the origin isn't clearly the runner's own, it's left out. Uploads are the runner's own
/// files (docs/activity-import.md). Never read <c>includeSynced</c> logs, Strava completions or the sync cache here.
/// </summary>
internal sealed class TrainingEvidence(IApplicationDbContext db)
{
    public const int Days = 28;

    public async Task<TrainingEvidenceDto> ReadAsync(SavedPlan plan, Runner runner, DateOnly today, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(runner);
        var from = today.AddDays(-Days);
        var uploads = await db.Activities.AsNoTracking()
            .Where(a => a.RunnerId == runner.Id && a.Source == ActivitySource.Upload && a.Kind != ActivityKind.Other
                && a.LocalDate >= from && a.LocalDate <= today)
            .Select(a => new { a.Id, a.LocalDate, a.DistanceMetres, a.MovingTime })
            .ToListAsync(cancellationToken);
        var checkIns = await db.SessionCheckIns.AsNoTracking()
            .Where(c => c.SavedPlanId == plan.Id && c.Date >= from && c.Date <= today)
            .OrderBy(c => c.Date).ThenBy(c => c.Id)
            .ToListAsync(cancellationToken);

        var uploadIds = uploads.Select(u => u.Id).ToHashSet();
        var used = new HashSet<Guid>();
        var excluded = 0;
        List<EvidenceRunDto> runs = [];
        foreach (var c in checkIns)
        {
            if (c.ActivityId is { } linked && !uploadIds.Contains(linked))
            {
                // Linked to a Strava run, or a run no longer here: its numbers may not be the runner's own to share.
                excluded++;
                continue;
            }

            // A check-in on an upload, or the planned run on a day with one upload, is that upload: one run, counted once.
            var upload = c.ActivityId is { } id ? uploads.First(u => u.Id == id)
                : c.IsAdditional ? null : uploads.Where(u => u.LocalDate == c.Date && !used.Contains(u.Id)).Take(2).ToList() is [var only] ? only : null;
            if (upload is not null)
            {
                used.Add(upload.Id);
                runs.Add(Upload(upload.LocalDate, upload.DistanceMetres, upload.MovingTime, c));
            }
            else
            {
                var km = c.Status == CheckInStatus.Skipped ? null : c.DistanceKm;
                runs.Add(new EvidenceRunDto(c.Date, EvidenceSource.CheckIn, c.IsAdditional ? null : c.SessionType, c.Status, km,
                    c.Duration is { } d ? (int)Math.Round(d.TotalMinutes) : null,
                    km is > 0 && c.Duration is { } t ? Math.Round(t.TotalSeconds / km.Value) : null, c.Effort, c.Pain));
            }
        }

        runs.AddRange(uploads.Where(u => !used.Contains(u.Id)).Select(u => Upload(u.LocalDate, u.DistanceMetres, u.MovingTime, null)));
        return new TrainingEvidenceDto(from, today, [.. runs.OrderBy(r => r.Date)], excluded);
    }

    private static EvidenceRunDto Upload(DateOnly date, double metres, TimeSpan moving, SessionCheckIn? c)
    {
        var km = Math.Round(metres / 1000, 2);
        return new EvidenceRunDto(date, EvidenceSource.Upload, c is null || c.IsAdditional ? null : c.SessionType, c?.Status, km,
            (int)Math.Round(moving.TotalMinutes), km > 0 ? Math.Round(moving.TotalSeconds / km) : null, c?.Effort, c?.Pain);
    }
}

/// <summary>The runner's own training on one of their plans, as the coach and the MCP tools see it.</summary>
public sealed record GetTrainingEvidenceQuery(Guid PlanId) : IRequest<TrainingEvidenceDto>;

internal sealed class GetTrainingEvidenceHandler(IApplicationDbContext db, CurrentRunner current, TrainingEvidence evidence, TimeProvider time)
    : IRequestHandler<GetTrainingEvidenceQuery, TrainingEvidenceDto>
{
    public async Task<TrainingEvidenceDto> Handle(GetTrainingEvidenceQuery request, CancellationToken cancellationToken)
    {
        var plan = await OwnPlan.FindAsync(db, current, request.PlanId, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        return await evidence.ReadAsync(plan, runner, CoachCalls.LocalToday(runner, time), cancellationToken);
    }
}
