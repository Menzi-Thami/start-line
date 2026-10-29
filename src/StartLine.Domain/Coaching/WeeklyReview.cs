using StartLine.Domain.Plans;

namespace StartLine.Domain.Coaching;

public enum RecoveryReadiness { NotReported, Ready, Tired, Unwell }
public sealed record WeeklyReviewFacts(PlanWeek Target, PlanWeek Reviewed, RecoveryReadiness Recovery, TimeSpan GoalTime,
    bool AdditionalRuns = false, bool ReportedPain = false);

/// <summary>Safeguards for newly reviewed calls. Neither historical generator nor old accepted decisions change.</summary>
public static class WeeklyReview
{
    public const int StrongWeeksBeforeProgressing = 3;
    public static CoachDecision Guide(CoachDecision candidate, IReadOnlyList<RunEvidence> evidence, IReadOnlyList<CoachDecision> previous, WeeklyReviewFacts facts)
    {
        ArgumentNullException.ThrowIfNull(candidate);
        ArgumentNullException.ThrowIfNull(evidence);
        ArgumentNullException.ThrowIfNull(previous);
        ArgumentNullException.ThrowIfNull(facts);
        var (target, reviewed, recovery, goal, additional, pain) = facts;
        var last = previous.LastOrDefault(c => c.WeekStart < candidate.WeekStart);
        var previousFactor = last?.PaceFactor ?? 1;
        var priorTime = last?.Fitness is { } prior ? prior > goal ? prior : goal : TimeSpan.FromSeconds(goal.TotalSeconds * previousFactor);
        var heldFitness = candidate.Fitness is { } measured && measured < priorTime && priorTime > goal ? priorTime : candidate.Fitness;
        if (pain || evidence.Any(e => e.CheckIn?.Pain == PainLevel.ChangedRunning) || recovery == RecoveryReadiness.Unwell)
            return candidate with
            {
                Verdict = CoachVerdict.Hurting,
                HoldVolume = true,
                DoseStep = -1,
                CutbackNow = true,
                Fitness = heldFitness,
                PaceFactor = Math.Max(candidate.PaceFactor, previousFactor),
                Reasons = [recovery == RecoveryReadiness.Unwell ? CoachReason.RecoveryIllness : CoachReason.Pain]
            };
        if (recovery == RecoveryReadiness.Tired)
            return candidate with
            {
                Verdict = CoachVerdict.Struggling,
                HoldVolume = true,
                DoseStep = -1,
                Fitness = heldFitness,
                PaceFactor = Math.Max(candidate.PaceFactor, previousFactor),
                Reasons = [.. candidate.Reasons, CoachReason.RecoveryFatigue]
            };
        var consecutive = Enumerable.Range(1, StrongWeeksBeforeProgressing - 1)
            .All(n => previous.Any(c => c.WeekStart == candidate.WeekStart.AddDays(-7 * n) && c.Verdict == CoachVerdict.Thriving));
        var complete = !additional && evidence.Count > 0 && evidence.All(e => e.IsKnown && e.CompletedAsPlanned
            && (e.CheckIn?.DistanceUnreported != true || e.RecordedKm is not null) && e.CheckIn?.Pain is not (PainLevel.Niggle or PainLevel.ChangedRunning));
        var recoveryWeek = target.IsCutback || target.Phase is TrainingPhase.Taper or TrainingPhase.RaceWeek;
        var progress = candidate.Verdict == CoachVerdict.Thriving && consecutive && complete && recovery == RecoveryReadiness.Ready && !recoveryWeek;
        var volumeGrows = target.PlannedKm > reviewed.PlannedKm + 0.1;
        var dose = progress && !volumeGrows ? candidate.DoseStep : Math.Min(0, candidate.DoseStep);
        var factor = progress && !volumeGrows && dose <= 0 ? candidate.PaceFactor : Math.Max(candidate.PaceFactor, previousFactor);
        var reasons = candidate.Reasons.ToList();
        if (candidate.Verdict == CoachVerdict.Thriving && !progress) reasons.Add(recoveryWeek ? CoachReason.RecoveryWeek : CoachReason.BuildingConsistency);
        else if (progress && (volumeGrows || dose > 0)) reasons.Add(CoachReason.OneDemandAtATime);
        return candidate with { DoseStep = dose, PaceFactor = factor, Fitness = !progress || volumeGrows || dose > 0 ? heldFitness : candidate.Fitness, Reasons = reasons };
    }
}
