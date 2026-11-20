using StartLine.Domain.Common;

namespace StartLine.Domain.AiCoach;

/// <summary>
/// How much of the AI provider one runner used on one UTC day: calls, tokens and the estimated cost in millionths of a US
/// dollar. Kept so the budget survives restarts (the in-memory rate limit doesn't), and holds no prompt, answer or training
/// data: only counts. Deleted with the runner's account.
/// </summary>
public sealed class AiUsageDay
{
    private AiUsageDay()
    {
    }

    public Guid RunnerId { get; private set; }

    public DateOnly Day { get; private set; }

    public int Calls { get; private set; }

    public long InputTokens { get; private set; }

    public long OutputTokens { get; private set; }

    public long CostMicroUsd { get; private set; }

    public static AiUsageDay Start(Guid runnerId, DateOnly day)
    {
        if (runnerId == Guid.Empty) throw new DomainException("AI usage belongs to a runner.");
        return new AiUsageDay { RunnerId = runnerId, Day = day };
    }

    /// <summary>Counts a call before it's made, so a failed or slow call still counts against the budget.</summary>
    public void Reserve() => Calls++;

    /// <summary>Adds what a finished call used.</summary>
    public void Record(long inputTokens, long outputTokens, long costMicroUsd)
    {
        if (inputTokens < 0 || outputTokens < 0 || costMicroUsd < 0) throw new DomainException("AI usage can't be negative.");
        InputTokens += inputTokens;
        OutputTokens += outputTokens;
        CostMicroUsd += costMicroUsd;
    }
}
