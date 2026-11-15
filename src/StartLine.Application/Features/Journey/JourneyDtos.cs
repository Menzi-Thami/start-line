using System.Globalization;
using StartLine.Domain.Journey;
using StartLine.Domain.Plans;

namespace StartLine.Application.Features.Journey;

/// <summary>The runner's journey: every plan as a chapter (current first), the recovery going on, and easy running.</summary>
public sealed record JourneyDto(IReadOnlyList<PlanChapterDto> Chapters, RecoveryPlanDto? Recovery, MaintenancePlanDto? Maintenance);

/// <param name="Weeks">Week by week, only on the chapter's own route.</param>
public sealed record PlanChapterDto(
    Guid PlanId,
    string Name,
    string RaceName,
    DateOnly? RaceDate,
    double? DistanceKm,
    SavedPlanStatus Status,
    DateOnly StartDate,
    JourneyLifecycle Lifecycle,
    TrainingRecapDto Training,
    RaceResultDto? RaceResult,
    IReadOnlyList<AchievementDto> Achievements,
    TimeSpan GoalTime,
    IReadOnlyList<ChapterWeekDto>? Weeks,
    bool DetailsUnavailable = false);

/// <summary>
/// The plan's training, truthfully. Only the runner's own "Done" confirms a run. <c>RecordedKm</c> is the runner's own
/// distances and uploads, null without any. <c>SwappedRuns</c> counts runs done easy instead of as planned: answered, not confirmed.
/// </summary>
public sealed record TrainingRecapDto(
    int ScheduledRuns,
    int ConfirmedRuns,
    int CutShortRuns,
    int SkippedRuns,
    int UnansweredRuns,
    int Weeks,
    int RunningDays,
    double PlannedKmConfirmed,
    double? RecordedKm,
    int RecordedRuns,
    double? LongestRecordedKm,
    DateOnly? LongestRecordedOn,
    DateOnly? LastTrainingDate,
    bool AllConfirmed,
    bool TrainingEnded,
    bool RaceDatePassed,
    int SwappedRuns)
{
    public static TrainingRecapDto From(TrainingRecapResult r)
    {
        ArgumentNullException.ThrowIfNull(r);
        return new(r.ScheduledRuns, r.ConfirmedRuns, r.CutShortRuns, r.SkippedRuns, r.UnansweredRuns, r.Weeks, r.RunningDays,
            r.PlannedKmConfirmed, r.RecordedKm, r.RecordedRuns, r.LongestRecordedKm, r.LongestRecordedOn, r.LastTrainingDate,
            r.AllConfirmed, r.TrainingEnded, r.RaceDatePassed, r.SwappedRuns);
    }
}

public sealed record ChapterWeekDto(DateOnly WeekStart, int ScheduledRuns, int ConfirmedRuns, double? RecordedKm);

public sealed record AchievementDto(Guid Id, AchievementKind Kind, Guid PlanId, DateOnly EarnedOn, DateTimeOffset AwardedAt, DateTimeOffset? CelebratedAt)
{
    public static AchievementDto From(Achievement a)
    {
        ArgumentNullException.ThrowIfNull(a);
        return new(a.Id, a.Kind, a.SavedPlanId, a.EarnedOn, a.AwardedAt, a.CelebratedAt);
    }
}

/// <param name="RaceDate">The runner's local race date; the plan's race date when left out.</param>
/// <param name="ExpectedVersion">The <c>version</c> last read. When given and the result changed since, the save is refused (409).</param>
public sealed record SaveRaceResultRequest(
    RaceOutcome Outcome,
    DateOnly? RaceDate = null,
    TimeSpan? FinishTime = null,
    double? DistanceKm = null,
    Guid? ActivityId = null,
    string? Note = null,
    string? ExpectedVersion = null);

/// <param name="VersusGoal">The finish time against the plan's goal, "-hh:mm:ss" faster or "+hh:mm:ss" slower.</param>
public sealed record RaceResultDto(
    Guid Id,
    Guid PlanId,
    RaceOutcome Outcome,
    DateOnly RaceDate,
    TimeSpan? FinishTime,
    double? DistanceKm,
    Guid? ActivityId,
    string? Note,
    TimeSpan? GoalTime,
    string? VersusGoal,
    string Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static RaceResultDto From(RaceResult r, TimeSpan? goal)
    {
        ArgumentNullException.ThrowIfNull(r);
        return new(r.Id, r.SavedPlanId, r.Outcome, r.RaceDate, r.FinishTime, r.DistanceKm, r.ActivityId, r.Note, goal,
            r.VersusGoal(goal) is { } versus ? Difference(versus) : null, JourneyVersion.Of(r.Version), r.CreatedAt, r.UpdatedAt);
    }

    /// <summary>"+01:02:03" or "-00:04:05": total hours, so a 30-hour difference stays readable.</summary>
    public static string Difference(TimeSpan difference)
    {
        var sign = difference < TimeSpan.Zero ? "-" : "+";
        var d = difference.Duration();
        return string.Create(CultureInfo.InvariantCulture, $"{sign}{(int)d.TotalHours:00}:{d.Minutes:00}:{d.Seconds:00}");
    }
}

/// <param name="PlanId">The plan whose race this recovers from; leave out for an event outside a plan (in the last 60 days).</param>
/// <param name="Feeling">An optional first check-in, for today.</param>
public sealed record StartRecoveryRequest(
    Guid? PlanId,
    string? EventName,
    double DistanceKm,
    DateOnly RaceDate,
    RecoveryEffort Effort,
    RecoveryPreference Preference,
    IReadOnlyList<DayOfWeek>? RunDays = null,
    RecoveryFeeling? Feeling = null,
    IReadOnlyList<RecoveryRedFlag>? RedFlags = null);

public enum RecoveryAction
{
    Pause,
    Resume,
    Extend,
    Complete,
    End,
    Restart,
    Update,
}

/// <param name="ExtendDays">For <c>Extend</c>: 1–14 days more of easy return.</param>
/// <param name="ExpectedVersion">The <c>version</c> last read. When given and the recovery changed since, the change is refused (409).</param>
public sealed record ChangeRecoveryRequest(
    RecoveryAction Action,
    int? ExtendDays = null,
    RecoveryEffort? Effort = null,
    RecoveryPreference? Preference = null,
    IReadOnlyList<DayOfWeek>? RunDays = null,
    string? ExpectedVersion = null);

/// <param name="Date">The local day this is for: today when left out, or any day back to race day. One per day; a second replaces it.</param>
public sealed record RecoveryCheckInRequest(DateOnly? Date, RecoveryFeeling Feeling, IReadOnlyList<RecoveryRedFlag>? RedFlags = null, string? Note = null);

public sealed record RecoveryDayDto(
    DateOnly Date,
    int DayNumber,
    RecoveryPhase Phase,
    RecoveryDayKind Kind,
    string Title,
    string Guidance,
    int? MinMinutes,
    int? MaxMinutes,
    bool Optional,
    bool Gated);

public sealed record RecoveryCheckInDto(DateOnly Date, RecoveryFeeling Feeling, IReadOnlyList<RecoveryRedFlag> RedFlags, string? Note);

public sealed record RecoveryPauseDto(DateOnly From, DateOnly? To);

/// <param name="DayNumber">Days since the race today (race day is 0).</param>
/// <param name="Phase">Today's phase.</param>
public sealed record RecoveryPlanDto(
    Guid Id,
    Guid? PlanId,
    string EventName,
    double DistanceKm,
    RecoveryCategory Category,
    DateOnly RaceDate,
    RecoveryEffort Effort,
    RecoveryPreference Preference,
    IReadOnlyList<DayOfWeek> RunDays,
    RecoveryStatus Status,
    int GeneratorVersion,
    int DayNumber,
    DateOnly EndsOn,
    string Framing,
    RecoveryReadinessState Readiness,
    RecoveryPhase Phase,
    bool SeekCare,
    string? SafetyMessage,
    bool CanComplete,
    IReadOnlyList<RecoveryDayDto> Days,
    IReadOnlyList<RecoveryCheckInDto> CheckIns,
    IReadOnlyList<RecoveryPauseDto> Pauses,
    int ExtraDays,
    string Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateOnly? EndedOn)
{
    public static RecoveryPlanDto From(RecoveryPlan p, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(p);
        var s = p.Schedule(today);
        var phase = p.Status == RecoveryStatus.Paused ? RecoveryPhase.Paused : s.Phase;
        return new(
            p.Id, p.SavedPlanId, p.EventName, p.DistanceKm, s.Category, p.RaceDate, p.Effort, p.Preference, p.RunDays, p.Status,
            p.GeneratorVersion, s.DayNumber, s.EndsOn, s.Framing, s.Readiness, phase, s.SeekCare, s.SafetyMessage, s.CanComplete,
            [.. s.Days.Select(d => new RecoveryDayDto(d.Date, d.DayNumber, d.Phase, d.Kind, d.Title, d.Guidance, d.MinMinutes, d.MaxMinutes, d.Optional, d.Gated))],
            [.. p.CheckIns.Select(c => new RecoveryCheckInDto(c.Date, c.Feeling, c.RedFlags, c.Note))],
            [.. p.Pauses.Select(x => new RecoveryPauseDto(x.From, x.To))],
            p.ExtraDays, JourneyVersion.Of(p.Version), p.CreatedAt, p.UpdatedAt, p.EndedOn);
    }
}

/// <param name="RunDays">The days to run on; without them, the last plan's days (else Tuesday, Thursday, Saturday, Sunday).</param>
public sealed record StartMaintenanceRequest(int DaysPerWeek, IReadOnlyList<DayOfWeek>? RunDays = null, bool IncludeStrength = false);

public sealed record MaintenanceSessionDto(DateOnly Date, MaintenanceSessionKind Kind, string Title, string Guidance, int MinMinutes, int MaxMinutes, bool Optional);

public sealed record MaintenanceWeekDto(DateOnly WeekStart, IReadOnlyList<MaintenanceSessionDto> Sessions);

public sealed record MaintenancePlanDto(
    Guid Id,
    int DaysPerWeek,
    IReadOnlyList<DayOfWeek> RunDays,
    bool IncludeStrength,
    DateOnly StartedOn,
    MaintenanceStatus Status,
    IReadOnlyList<MaintenanceWeekDto> Weeks,
    string Version)
{
    public static MaintenancePlanDto From(MaintenancePlan p, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(p);
        return new(p.Id, p.DaysPerWeek, p.RunDays, p.IncludeStrength, p.StartedOn, p.Status,
            [.. p.Weeks(today).Select(w => new MaintenanceWeekDto(w.WeekStart,
                [.. w.Sessions.Select(s => new MaintenanceSessionDto(s.Date, s.Kind, s.Title, s.Guidance, s.MinMinutes, s.MaxMinutes, s.Optional))]))],
            JourneyVersion.Of(p.Version));
    }
}

/// <summary>Everything kept about the runner's journey, for the account export.</summary>
public sealed record JourneyExportDto(
    IReadOnlyList<RaceResultDto> RaceResults,
    IReadOnlyList<AchievementDto> Achievements,
    IReadOnlyList<RecoveryPlanDto> Recoveries,
    IReadOnlyList<MaintenancePlanDto> Maintenance);

/// <summary>A row version as the client holds it: opaque base64, sent back as <c>expectedVersion</c>.</summary>
internal static class JourneyVersion
{
    public static string Of(byte[] version) => Convert.ToBase64String(version ?? []);

    public static bool Matches(string? expected, byte[] actual) => expected is null || string.Equals(expected, Of(actual), StringComparison.Ordinal);
}
