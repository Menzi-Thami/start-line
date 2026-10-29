using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;
namespace StartLine.Domain.Tests.Coaching;

public sealed class WeeklyReviewTests
{
    private static readonly DateOnly Monday = new(2026, 11, 2);
    private static readonly PlannedSession Tempo = new(Monday.AddDays(-4), SessionType.Tempo, "Tempo", "", "", 10, PaceZone.Tempo);
    private static readonly CoachDecision Strong = new(Monday, CoachVerdict.Thriving, false, 1, false, [CoachReason.ThrivingTwice], PaceFactor: 0.98);
    private static readonly IReadOnlyList<RunEvidence> Complete = [new(Tempo, new(CheckInStatus.Done, 3, DistanceKm: 10))];
    private static readonly IReadOnlyList<CoachDecision> Previous = [Strong with { WeekStart = Monday.AddDays(-14) }, Strong with { WeekStart = Monday.AddDays(-7) }];
    private static WeeklyReviewFacts Facts(RecoveryReadiness recovery = RecoveryReadiness.Ready, bool grows = false, bool cutback = false, TrainingPhase phase = TrainingPhase.Build) =>
        new(new(4, Monday, phase, cutback, [Tempo with { Date = Monday.AddDays(2), DistanceKm = grows ? 11 : 10 }]), new(3, Monday.AddDays(-7), TrainingPhase.Build, false, [Tempo]), recovery, TimeSpan.FromMinutes(50));
    [Fact]
    public void One_fast_week_cannot_escalate_training()
    { var result = WeeklyReview.Guide(Strong, Complete, [], Facts()); result.DoseStep.ShouldBe(0); result.PaceFactor.ShouldBe(1); }
    [Fact]
    public void Three_strong_weeks_can_increase_dose_without_increasing_speed()
    { var result = WeeklyReview.Guide(Strong, Complete, Previous, Facts()); result.DoseStep.ShouldBe(1); result.PaceFactor.ShouldBe(0.98); }
    [Fact]
    public void Distance_growth_cannot_also_increase_dose_or_speed()
    { var result = WeeklyReview.Guide(Strong with { PaceFactor = 0.96 }, Complete, Previous, Facts(grows: true)); result.DoseStep.ShouldBe(0); result.PaceFactor.ShouldBe(0.98); }
    [Theory]
    [InlineData(RecoveryReadiness.NotReported)]
    [InlineData(RecoveryReadiness.Tired)]
    [InlineData(RecoveryReadiness.Unwell)]
    public void Progression_requires_positive_recovery(RecoveryReadiness readiness) => WeeklyReview.Guide(Strong, Complete, Previous, Facts(readiness)).DoseStep.ShouldBeLessThanOrEqualTo(0);
    [Theory]
    [InlineData(true, TrainingPhase.Build)]
    [InlineData(false, TrainingPhase.Taper)]
    [InlineData(false, TrainingPhase.RaceWeek)]
    public void Recovery_and_taper_weeks_are_protected(bool cutback, TrainingPhase phase) => WeeklyReview.Guide(Strong, Complete, Previous, Facts(cutback: cutback, phase: phase)).DoseStep.ShouldBe(0);
    [Fact]
    public void Missing_logs_substitutions_and_additional_runs_cannot_promote_training()
    {
        foreach (var e in new RunEvidence[] { new(Tempo, null), new(Tempo, new(CheckInStatus.SwappedForEasy, 3)), new(Tempo, new(CheckInStatus.Done, 3, DistanceUnreported: true)) })
            WeeklyReview.Guide(Strong, [e], Previous, Facts()).DoseStep.ShouldBe(0);
        WeeklyReview.Guide(Strong, Complete, Previous, Facts() with { AdditionalRuns = true }).DoseStep.ShouldBe(0);
    }
    [Fact]
    public void Pain_overrides_low_evidence()
    { var result = WeeklyReview.Guide(CoachDecision.AsPlanned(Monday, CoachVerdict.NotEnoughToGoOn), [], [], Facts() with { ReportedPain = true }); result.Verdict.ShouldBe(CoachVerdict.Hurting); result.CutbackNow.ShouldBeTrue(); }
}
