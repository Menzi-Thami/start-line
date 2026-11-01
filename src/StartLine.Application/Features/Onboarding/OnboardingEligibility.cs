using System.Globalization;
using StartLine.Domain.Runners;

namespace StartLine.Application.Features.Onboarding;

/// <summary>
/// What decides whether a runner is due an onboarding email, read fresh from the database each time. Running evidence is
/// what Taperday keeps for good: check-ins that say a run happened (not skipped) and uploaded runs. Strava runs are a 7-day
/// cache and nothing about them is stored, so they only ever hold an email back, at the moment of sending.
/// </summary>
/// <param name="RegisteredAt">When the account was made.</param>
/// <param name="FirstPlanAt">The first saved plan ever, current or archived; null when they've never saved one.</param>
/// <param name="LatestPlanAt">The newest saved plan, current or archived.</param>
/// <param name="LastRecordedRunOn">The latest day with a completed check-in or an upload; null when there's none at all.</param>
/// <param name="HasEmail">An address to send to.</param>
/// <param name="AcceptsUpdates">News and updates are on (<see cref="Runner.UpdateEmails"/>).</param>
/// <param name="HasSyncedRunsNow">Strava runs in the cache right now: running Taperday can see but doesn't keep.</param>
/// <param name="SyncSourceUnavailable">A Strava connection needing reconnecting: runs may be happening that Taperday can't see.</param>
public sealed record OnboardingFacts(
    DateTimeOffset RegisteredAt,
    DateTimeOffset? FirstPlanAt,
    DateTimeOffset? LatestPlanAt,
    DateOnly? LastRecordedRunOn,
    bool HasEmail,
    bool AcceptsUpdates,
    bool HasSyncedRunsNow = false,
    bool SyncSourceUnavailable = false);

/// <summary>The email a runner is due: its campaign and episode, which together with the runner are its delivery key.</summary>
public sealed record OnboardingDecision(OnboardingCampaign Campaign, string Episode = "");

/// <summary>An onboarding email already claimed for this runner, as the eligibility rules need it.</summary>
public sealed record PastOnboardingEmail(OnboardingCampaign Campaign, string Episode, DateTimeOffset ClaimedAt, bool MayHaveGone);

/// <summary>
/// Which onboarding email, if any, a runner is due. The cohorts are mutually exclusive and checked in order: no plan ever,
/// then a plan but no run ever recorded, then recorded runs but none lately. A runner moves from one to the next as they
/// go; they're never in two at once.
/// </summary>
public static class OnboardingEligibility
{
    /// <summary>Signup to the first email: long enough to have built a plan on their own if they were going to.</summary>
    public static readonly TimeSpan SignupWait = TimeSpan.FromHours(48);

    /// <summary>First plan to "your first run is waiting".</summary>
    public static readonly TimeSpan FirstRunWait = TimeSpan.FromDays(7);

    /// <summary>Quiet this long after the last recorded run (or the account, or a new plan) counts as inactive.</summary>
    public static readonly TimeSpan QuietFor = TimeSpan.FromDays(21);

    /// <summary>At most one "ready when you are" this often, however many quiet spells there are.</summary>
    public static readonly TimeSpan ReturnCooldown = TimeSpan.FromDays(60);

    /// <summary>Two onboarding emails of any kind are never closer together than this.</summary>
    public static readonly TimeSpan GapBetweenEmails = TimeSpan.FromDays(14);

    public static OnboardingDecision? Classify(OnboardingFacts facts, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(facts);
        if (!facts.HasEmail || !facts.AcceptsUpdates || facts.RegisteredAt > now)
        {
            return null;
        }

        // 1. Never saved a plan (archived ones count as saved). Whatever else they've done, the next step is a plan.
        if (facts.FirstPlanAt is not { } firstPlan)
        {
            return now - facts.RegisteredAt >= SignupWait ? new(OnboardingCampaign.StartPlan) : null;
        }

        // Runs Taperday can see but doesn't keep, or can't see at all: "not recorded" may not mean "not running", so say nothing.
        if (facts.HasSyncedRunsNow || facts.SyncSourceUnavailable)
        {
            return null;
        }

        // 2. A plan, and no run recorded ever.
        if (facts.LastRecordedRunOn is not { } lastRun)
        {
            return now - firstPlan >= FirstRunWait ? new(OnboardingCampaign.FirstRun) : null;
        }

        // 3. Ran before, quiet since. Quiet counts from the end of the last day with a run, and never from before the account
        // or the newest plan: runs uploaded from before signing up, or a plan built yesterday, aren't a quiet spell.
        var lastRunEnded = new DateTimeOffset(lastRun.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var quietSince = Max(Max(lastRunEnded, facts.RegisteredAt), facts.LatestPlanAt ?? firstPlan);
        return now - quietSince >= QuietFor
            ? new(OnboardingCampaign.ReturnToRunning, lastRun.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))
            : null;
    }

    /// <summary>
    /// Whether what's already gone allows this email now. The same email's own row (a retry) is the claim's business, not
    /// this. Any other onboarding email that may have gone keeps the next one at least <see cref="GapBetweenEmails"/> away.
    /// "Ready when you are" needs running since the last one (a later episode) and <see cref="ReturnCooldown"/> since it.
    /// </summary>
    public static bool Allowed(OnboardingDecision decision, IEnumerable<PastOnboardingEmail> past, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(decision);
        ArgumentNullException.ThrowIfNull(past);
        var others = past.Where(p => !(p.Campaign == decision.Campaign && p.Episode == decision.Episode)).ToList();
        if (others.Any(p => p.MayHaveGone && now - p.ClaimedAt < GapBetweenEmails))
        {
            return false;
        }

        if (decision.Campaign != OnboardingCampaign.ReturnToRunning)
        {
            return true;
        }

        var returns = others.Where(p => p.Campaign == OnboardingCampaign.ReturnToRunning).ToList();
        return !returns.Any(p => string.CompareOrdinal(p.Episode, decision.Episode) >= 0)
            && !returns.Any(p => p.MayHaveGone && now - p.ClaimedAt < ReturnCooldown);
    }

    private static DateTimeOffset Max(DateTimeOffset a, DateTimeOffset b) => a > b ? a : b;
}

/// <summary>
/// How many onboarding emails may go: per run of the worker, per day, and within the whole day's email budget (Brevo's
/// free plan allows 300 a day across every email Taperday sends). The weekly recap comes first: what it sent in the last
/// day, and one email for every runner who has it on, are held back for it.
/// </summary>
public sealed record OnboardingBudget(int MaxPerRun, int DailyLimit, int DailyEmailBudget)
{
    public static readonly OnboardingBudget Default = new(MaxPerRun: 5, DailyLimit: 40, DailyEmailBudget: 250);

    public int Allowance(int onboardingLastDay, int otherEmailsLastDay, int recapReserve)
    {
        var left = Math.Min(DailyLimit - onboardingLastDay, DailyEmailBudget - onboardingLastDay - otherEmailsLastDay - recapReserve);
        return Math.Max(0, Math.Min(MaxPerRun, left));
    }
}
