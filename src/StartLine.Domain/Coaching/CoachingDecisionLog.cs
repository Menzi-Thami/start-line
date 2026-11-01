using StartLine.Domain.Common;

namespace StartLine.Domain.Coaching;

public enum CoachingOutcome { Accepted, Declined }

/// <summary>
/// One answer the runner gave to a weekly coaching suggestion: accepted or declined, with what was suggested and why.
/// The history of what the coach offered and what the runner chose. The suggestion comes from the same evidence as a
/// <see cref="CoachWeek"/> (check-ins and uploads only), so it may be kept for good.
/// </summary>
public sealed class CoachingDecisionLog
{
    private CoachingDecisionLog()
    {
    }

    public Guid Id { get; private set; }

    public Guid SavedPlanId { get; private set; }

    public DateOnly WeekStart { get; private set; }

    public CoachingOutcome Outcome { get; private set; }

    public CoachVerdict Verdict { get; private set; }

    /// <summary>The reasons as their names, comma separated, as on <see cref="CoachWeek"/>.</summary>
    public string Reasons { get; private set; } = "";

    /// <summary>Whether the suggestion would have changed the plan; false for "keep training as planned".</summary>
    public bool ChangedPlan { get; private set; }

    public RecoveryReadiness Recovery { get; private set; }

    public DateTimeOffset DecidedAt { get; private set; }

    public static CoachingDecisionLog Record(Guid savedPlanId, CoachDecision suggestion, CoachingOutcome outcome, bool changedPlan, RecoveryReadiness recovery, DateTimeOffset at)
    {
        ArgumentNullException.ThrowIfNull(suggestion);
        if (savedPlanId == Guid.Empty)
        {
            throw new DomainException("A coaching answer belongs to a saved plan.");
        }

        return new CoachingDecisionLog
        {
            Id = Guid.NewGuid(),
            SavedPlanId = savedPlanId,
            WeekStart = suggestion.WeekStart,
            Outcome = outcome,
            Verdict = suggestion.Verdict,
            Reasons = string.Join(',', suggestion.Reasons),
            ChangedPlan = changedPlan,
            Recovery = recovery,
            DecidedAt = at,
        };
    }

    public IReadOnlyList<CoachReason> ReasonList =>
        [.. Reasons.Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(r => Enum.TryParse<CoachReason>(r, out var reason) ? reason : (CoachReason?)null)
            .OfType<CoachReason>()];
}
