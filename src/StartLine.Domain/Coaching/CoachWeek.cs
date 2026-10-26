using StartLine.Domain.Common;

namespace StartLine.Domain.Coaching;

/// <summary>
/// The coach's call for one week of a saved plan, kept once it's made. The plan is generated from its answers and
/// these calls, so the weeks already run never change after the fact. Kept for good, so made only from what Taperday may
/// keep for good: check-ins and uploaded runs (<see cref="CoachEvidence"/>).
/// </summary>
public sealed class CoachWeek
{
    private CoachWeek()
    {
    }

    public Guid Id { get; private set; }

    public Guid SavedPlanId { get; private set; }

    public DateOnly WeekStart { get; private set; }

    public CoachVerdict Verdict { get; private set; }

    public bool HoldVolume { get; private set; }

    public int DoseStep { get; private set; }

    public bool CutbackNow { get; private set; }

    /// <summary>The reasons as their names, comma separated: a short list that's only ever read whole.</summary>
    public string Reasons { get; private set; } = "";

    /// <summary>The race time recorded runs pointed to that week, in seconds; null without any.</summary>
    public double? FitnessSeconds { get; private set; }

    /// <summary>The nudge to the paces from how hard sessions felt; 1 is none.</summary>
    public double PaceFactor { get; private set; } = 1;

    public DateTimeOffset CreatedAt { get; private set; }

    public static CoachWeek From(Guid savedPlanId, CoachDecision decision)
    {
        ArgumentNullException.ThrowIfNull(decision);
        if (savedPlanId == Guid.Empty)
        {
            throw new DomainException("A coach's call belongs to a saved plan.");
        }

        return new CoachWeek
        {
            Id = Guid.NewGuid(),
            SavedPlanId = savedPlanId,
            WeekStart = decision.WeekStart,
            Verdict = decision.Verdict,
            HoldVolume = decision.HoldVolume,
            DoseStep = Math.Clamp(decision.DoseStep, -1, 1),
            CutbackNow = decision.CutbackNow,
            Reasons = string.Join(',', decision.Reasons),
            FitnessSeconds = decision.Fitness?.TotalSeconds,
            PaceFactor = decision.PaceFactor,
        };
    }

    public CoachDecision ToDecision() => new(
        WeekStart,
        Verdict,
        HoldVolume,
        DoseStep,
        CutbackNow,
        [.. Reasons.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(r => Enum.TryParse<CoachReason>(r, out var reason) ? reason : (CoachReason?)null)
            .OfType<CoachReason>()],
        FitnessSeconds is { } seconds ? TimeSpan.FromSeconds(seconds) : null,
        PaceFactor);
}
