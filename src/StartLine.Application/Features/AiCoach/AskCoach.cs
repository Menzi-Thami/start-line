using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Account;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.Coaching;
using StartLine.Application.Features.MyPlans;
using StartLine.Application.Features.Plans;
using StartLine.Domain.AiCoach;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.AiCoach;

/// <summary>What the coach used to answer: how many runs, from which sources, over which days, and how many it had to leave out.</summary>
public sealed record CoachEvidenceSummaryDto(int Runs, int CheckIns, int Uploads, double Km, DateOnly From, DateOnly To, int ExcludedLinkedRuns)
{
    public static CoachEvidenceSummaryDto Of(TrainingEvidenceDto evidence)
    {
        ArgumentNullException.ThrowIfNull(evidence);
        return new(evidence.Runs.Count, evidence.CheckIns, evidence.Uploads, evidence.Km, evidence.From, evidence.To, evidence.ExcludedLinkedRuns);
    }
}

/// <summary>Who understood the question: Taperday's own rules, or the AI provider (with the rules still checking every change).</summary>
public enum CoachAnswerSource { Rules, Ai }

/// <summary>
/// The coach's answer: words, who understood the question, what it took the question to mean, a checked exact change to preview
/// (if one was asked for), whether to open the weekly review, the evidence it used, and a notice when the AI couldn't help.
/// </summary>
public sealed record CoachAnswerDto(
    string Reply,
    CoachAnswerSource Source,
    CoachIntentKind Intent,
    SessionAdjustmentDto? Adjustment,
    bool OfferWeeklyReview,
    CoachEvidenceSummaryDto Evidence,
    string? Notice);

/// <summary>Asks the coach about the runner's current plan. Never changes the plan: a suggested change is a preview to apply separately.</summary>
public sealed record AskCoachCommand(Guid Id, string Question) : IRequest<CoachAnswerDto>
{
    public const int MaxQuestionLength = 500;
}

internal sealed partial class AskCoachHandler(
    IApplicationDbContext db,
    CurrentRunner current,
    PlanBuilder builder,
    TimeProvider time,
    TrainingEvidence evidenceReader,
    SessionAdjustments adjustments,
    AiBudget budget,
    ICoachLanguageModel model,
    AiCoachSettings settings,
    ILogger<AskCoachHandler> logger) : IRequestHandler<AskCoachCommand, CoachAnswerDto>
{
    public const int MaxQuestionLength = AskCoachCommand.MaxQuestionLength;
    public const int MaxReplyLength = 900;
    public const int UpcomingSessions = 14;

    private static readonly JsonSerializerOptions ContextJson = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    public async Task<CoachAnswerDto> Handle(AskCoachCommand request, CancellationToken cancellationToken)
    {
        var question = request.Question?.Trim() ?? "";
        if (question.Length is < 3 or > MaxQuestionLength)
            throw new ValidationException(new Dictionary<string, string[]> { ["question"] = [$"Ask in 3 to {MaxQuestionLength} characters."] });
        var saved = await OwnPlan.FindAsync(db, current, request.Id, cancellationToken);
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        if (saved.Status != SavedPlanStatus.Active)
            throw new ConflictException("plan_not_current", "The coach works on your current plan. A finished plan stays as it was.");
        var today = CoachCalls.LocalToday(runner, time);
        var calls = await CoachCalls.ForAsync(db, saved.Id, cancellationToken);
        var plan = builder.BuildPlan(SavedPlanMapping.ToQuery(saved), calls, saved.Adjustments, today);
        var evidence = await evidenceReader.ReadAsync(saved, runner, today, cancellationToken);
        var upcoming = plan.Weeks.SelectMany(w => w.Sessions)
            .Where(s => s.Date >= today && s.Type is not SessionType.Strength)
            .OrderBy(s => s.Date).Take(UpcomingSessions).ToList();

        CoachIntent? intent = null;
        var source = CoachAnswerSource.Rules;
        string? notice = null;
        if (settings.Enabled && model.IsConfigured && runner.AiCoachConsent)
        {
            if (await budget.TryReserveAsync(runner.Id, cancellationToken))
            {
                try
                {
                    var reply = await model.InterpretAsync(new CoachModelRequest(question, today, Context(plan, today, upcoming, evidence)), cancellationToken);
                    await budget.RecordAsync(runner.Id, reply.InputTokens, reply.OutputTokens, cancellationToken);
                    intent = Checked(reply.Intent);
                    source = CoachAnswerSource.Ai;
                }
                catch (CoachModelUnavailableException ex)
                {
                    await budget.RecordAsync(runner.Id, ex.InputTokens, ex.OutputTokens, cancellationToken);
                    LogModelUnavailable(logger, ex.Message);
                    notice = "The AI couldn’t answer just now, so this answer comes from Taperday’s training rules.";
                }
            }
            else
            {
                notice = "You’ve used today’s AI questions, so this answer comes from Taperday’s training rules. They reset tomorrow.";
            }
        }

        intent ??= RulesIntentReader.Read(question, today);
        return intent.Kind switch
        {
            CoachIntentKind.AdjustSession => await AdjustAsync(saved.Id, intent, today, upcoming, evidence, source, notice, cancellationToken),
            CoachIntentKind.WeeklyReview => new CoachAnswerDto(
                Words(intent.Reply) ?? "Your weekly review reads last week’s check-ins and uploaded runs, then suggests how the coming week should change. Nothing changes until you apply it.",
                source, CoachIntentKind.WeeklyReview, null, true, CoachEvidenceSummaryDto.Of(evidence), notice),
            CoachIntentKind.Clarify => new CoachAnswerDto(Words(intent.Reply) ?? "Can you say a little more? For example: “I only have 35 minutes tomorrow” or “make Saturday 18 km”.",
                source, CoachIntentKind.Clarify, null, false, CoachEvidenceSummaryDto.Of(evidence), notice),
            _ => new CoachAnswerDto(Words(intent.Reply) ?? RulesAnswer(evidence, upcoming), source, CoachIntentKind.Answer, null, false,
                CoachEvidenceSummaryDto.Of(evidence), notice),
        };
    }

    private async Task<CoachAnswerDto> AdjustAsync(Guid planId, CoachIntent intent, DateOnly today, IReadOnlyList<PlannedSession> upcoming,
        TrainingEvidenceDto evidence, CoachAnswerSource source, string? notice, CancellationToken cancellationToken)
    {
        // No day named: the next run that isn't done. The adjuster checks the day again, so a wrong guess can't change anything.
        var date = intent.Date ?? upcoming.FirstOrDefault(s => s.Type is not SessionType.Race)?.Date;
        if (date is null || intent.Adjustment is not { } kind)
            return new CoachAnswerDto("There’s no run coming up to change. Your plan has nothing left before the race.", source, CoachIntentKind.Answer, null, false,
                CoachEvidenceSummaryDto.Of(evidence), notice);
        try
        {
            var preview = await adjustments.RunAsync(planId, new SessionAdjustmentRequest(date.Value, kind, intent.Minutes, intent.Km, intent.PaceSecondsPerKm), null, cancellationToken);
            return new CoachAnswerDto(preview.Reason, source, CoachIntentKind.AdjustSession, preview, false, CoachEvidenceSummaryDto.Of(evidence), notice);
        }
        catch (DomainException ex)
        {
            var day = date.Value.ToString("dddd d MMMM", CultureInfo.InvariantCulture);
            var reply = date.Value < today ? ex.Message : $"{ex.Message} ({day}.)";
            return new CoachAnswerDto(reply, source, CoachIntentKind.Answer, null, false, CoachEvidenceSummaryDto.Of(evidence), notice);
        }
    }

    /// <summary>The model's reading, held to what the rules accept: a known kind, in-range numbers, short words. Anything else is dropped.</summary>
    private static CoachIntent Checked(CoachIntent intent)
    {
        if (!Enum.IsDefined(intent.Kind)) return new CoachIntent(CoachIntentKind.Answer, intent.Reply);
        if (intent.Kind != CoachIntentKind.AdjustSession) return intent with { Adjustment = null, Minutes = null, Km = null, PaceSecondsPerKm = null };
        return intent.Adjustment switch
        {
            AdjustmentKind.Duration when intent.Minutes is >= SessionAdjuster.MinMinutes and <= SessionAdjuster.MaxMinutes => intent with { Km = null, PaceSecondsPerKm = null },
            AdjustmentKind.Distance when intent.Km is { } km && double.IsFinite(km) && km is >= RemainingWeek.MinimumRunKm and <= SessionAdjuster.MaxKm => intent with { Minutes = null, PaceSecondsPerKm = null },
            AdjustmentKind.Pace when intent.PaceSecondsPerKm is >= SessionAdjuster.FastestPaceSeconds and <= SessionAdjuster.SlowestPaceSeconds => intent with { Minutes = null, Km = null },
            _ => new CoachIntent(CoachIntentKind.Clarify, "Which run, and what would you like: a time (like 35 minutes), a distance (like 6 km) or a pace (like 6:15/km)?"),
        };
    }

    private static string? Words(string? reply)
    {
        if (string.IsNullOrWhiteSpace(reply)) return null;
        var clean = reply.Trim();
        return clean.Length <= MaxReplyLength ? clean : string.Concat(clean.AsSpan(0, MaxReplyLength - 1), "…");
    }

    private static string RulesAnswer(TrainingEvidenceDto evidence, IReadOnlyList<PlannedSession> upcoming)
    {
        var next = upcoming.FirstOrDefault(s => s.Type is not SessionType.Race);
        var lead = evidence.Runs.Count == 0
            ? "I haven’t got any of your own check-ins or uploaded runs from the last four weeks yet, so I’m going by your plan alone."
            : $"From your last four weeks I can see {evidence.Runs.Count} run{(evidence.Runs.Count == 1 ? "" : "s")} you logged or uploaded ({evidence.Km.ToString("0.#", CultureInfo.InvariantCulture)} km).";
        var nextRun = next is null ? "" : $" Next up: {next.Title.ToLowerInvariant()}, {next.DistanceKm.ToString("0.#", CultureInfo.InvariantCulture)} km on {next.Date.ToString("dddd", CultureInfo.InvariantCulture)}.";
        return $"{lead}{nextRun} I can change a run to fit the time you have, a distance or a pace, or review how next week should change. Try “I only have 30 minutes tomorrow”.";
    }

    /// <summary>The context the model sees: the plan ahead and the runner's own evidence. No names, emails, ids, heart rate or Strava data.</summary>
    private static string Context(TrainingPlan plan, DateOnly today, IReadOnlyList<PlannedSession> upcoming, TrainingEvidenceDto evidence) =>
        JsonSerializer.Serialize(new
        {
            today,
            todayWeekday = today.DayOfWeek.ToString(),
            race = new { date = plan.RaceDate, distanceKm = plan.RaceDistance.Kilometres, goal = plan.GoalTime.ToString(@"h\:mm\:ss", CultureInfo.InvariantCulture) },
            paces = plan.Paces.ToDictionary(p => p.Key.ToString(), p => new { fastest = Math.Round(p.Value.Fastest.SecondsPerKilometre), slowest = Math.Round(p.Value.Slowest.SecondsPerKilometre) }),
            upcoming = upcoming.Select(s => new { s.Date, weekday = s.Date.DayOfWeek.ToString(), s.Type, s.Title, km = Math.Round(s.DistanceKm, 2) }),
            ownRuns = evidence.Runs.Select(r => new { r.Date, r.Source, r.PlannedType, r.Status, km = r.DistanceKm, minutes = r.MovingMinutes, paceSecondsPerKm = r.PaceSecondsPerKm, r.Effort, r.Pain }),
            leftOutLinkedRuns = evidence.ExcludedLinkedRuns,
        }, ContextJson);

    [LoggerMessage(Level = LogLevel.Warning, Message = "AI coach model unavailable, answered from rules: {Reason}")]
    private static partial void LogModelUnavailable(ILogger logger, string reason);
}

/// <summary>
/// The AI budget, counted in the database so restarts can't reset it: calls per runner per UTC day, and estimated spend across
/// all runners per UTC month. A call is counted before it's made; past either limit, no call is made.
/// </summary>
internal sealed class AiBudget(IApplicationDbContext db, TimeProvider time, AiCoachSettings settings, ICoachLanguageModel model)
{
    public async Task<int> CallsLeftTodayAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        var day = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        var used = await db.AiUsage.AsNoTracking().Where(u => u.RunnerId == runnerId && u.Day == day).Select(u => u.Calls).FirstOrDefaultAsync(cancellationToken);
        return Math.Max(0, settings.DailyCallsPerRunner - used);
    }

    public async Task<AiCoachStatusDto> StatusAsync(Domain.Runners.Runner? runner, CancellationToken cancellationToken)
    {
        var available = settings.Enabled && model.IsConfigured;
        if (runner is null) return new AiCoachStatusDto(settings.Enabled, available, false, 0);
        return new AiCoachStatusDto(settings.Enabled, available, runner.AiCoachConsent,
            available && runner.AiCoachConsent ? await CallsLeftTodayAsync(runner.Id, cancellationToken) : 0);
    }

    public async Task<bool> TryReserveAsync(Guid runnerId, CancellationToken cancellationToken)
    {
        var day = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        var monthStart = new DateOnly(day.Year, day.Month, 1);
        var spent = await db.AiUsage.AsNoTracking().Where(u => u.Day >= monthStart && u.Day <= day).SumAsync(u => u.CostMicroUsd, cancellationToken);
        if (spent >= settings.MonthlyBudgetUsd * 1_000_000m) return false;
        var usage = await db.AiUsage.SingleOrDefaultAsync(u => u.RunnerId == runnerId && u.Day == day, cancellationToken);
        if (usage is not null && usage.Calls >= settings.DailyCallsPerRunner) return false;
        if (usage is null)
        {
            usage = AiUsageDay.Start(runnerId, day);
            db.AiUsage.Add(usage);
        }

        usage.Reserve();
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException)
        {
            // Two questions at once on a runner's first call of the day: one wins, the other answers from the rules.
            db.AiUsage.Entry(usage).State = EntityState.Detached;
            return false;
        }
    }

    public async Task RecordAsync(Guid runnerId, long inputTokens, long outputTokens, CancellationToken cancellationToken)
    {
        if (inputTokens <= 0 && outputTokens <= 0) return;
        var day = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        var usage = await db.AiUsage.SingleOrDefaultAsync(u => u.RunnerId == runnerId && u.Day == day, cancellationToken);
        if (usage is null) return;
        usage.Record(inputTokens, outputTokens, model.CostMicroUsd(inputTokens, outputTokens));
        await db.SaveChangesAsync(CancellationToken.None);
    }
}

/// <summary>Whether the coach is on, whether the AI part is available and agreed to, and how many AI questions are left today.</summary>
public sealed record AiCoachStatusDto(bool Enabled, bool ModelAvailable, bool Consent, int AiQuestionsLeftToday);

public sealed record AiCoachStatusQuery : IRequest<AiCoachStatusDto>;

internal sealed class AiCoachStatusHandler(CurrentRunner current, AiBudget budget) : IRequestHandler<AiCoachStatusQuery, AiCoachStatusDto>
{
    public async Task<AiCoachStatusDto> Handle(AiCoachStatusQuery request, CancellationToken cancellationToken) =>
        await budget.StatusAsync(await current.FindAsync(cancellationToken), cancellationToken);
}

/// <summary>Gives or withdraws the runner's agreement to their questions, plan and own check-ins going to the AI provider.</summary>
public sealed record SetAiCoachConsentCommand(bool Consent) : IRequest<AiCoachStatusDto>;

internal sealed class SetAiCoachConsentHandler(IApplicationDbContext db, CurrentRunner current, TimeProvider time, AiBudget budget)
    : IRequestHandler<SetAiCoachConsentCommand, AiCoachStatusDto>
{
    public async Task<AiCoachStatusDto> Handle(SetAiCoachConsentCommand request, CancellationToken cancellationToken)
    {
        var runner = await current.FindAsync(cancellationToken) ?? throw new NotFoundException("Runner", "me");
        runner.SetAiCoachConsent(request.Consent, time.GetUtcNow());
        await db.SaveChangesAsync(cancellationToken);
        return await budget.StatusAsync(runner, cancellationToken);
    }
}
