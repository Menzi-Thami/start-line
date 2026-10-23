using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>Where a runner's goal stands, given what's known about them. It never changes the plan.</summary>
public enum GoalVerdict
{
    /// <summary>Nothing yet says how fast the runner is, so only the build (time and distance) can be judged.</summary>
    NotAssessed,

    /// <summary>The runner is fitter than the goal asks for: they could aim higher.</summary>
    AheadOfGoal,

    /// <summary>Realistic: the training that's left is enough, and the time is within what it should take them to.</summary>
    OnTrack,

    /// <summary>Possible, but it needs most of the training to go to plan.</summary>
    Stretch,

    /// <summary>Unlikely on this plan: a slower goal would be more realistic.</summary>
    AtRisk,
}

/// <summary>One thing the verdict rests on, in plain words. <see cref="Code"/> is stable for the client and tests.</summary>
public sealed record OutlookReason(string Code, string Message);

/// <summary>
/// The coach's read on the goal: a verdict, a sentence saying what it means, and the reasons behind it.
/// <see cref="SuggestedGoal"/> is a faster goal when the runner is ahead of it, or a more realistic one when it's at risk.
/// <see cref="FitnessToday"/> is the race time the evidence points to, when there is any.
/// </summary>
public sealed record GoalOutlook(
    GoalVerdict Verdict,
    string Summary,
    IReadOnlyList<OutlookReason> Reasons,
    TimeSpan? SuggestedGoal = null,
    TimeSpan? FitnessToday = null);

/// <summary>A recent race or hard effort the runner tells us about, to judge a goal before any runs are recorded.</summary>
public sealed record RecentResult(Distance Distance, TimeSpan Time, DateOnly Date);
