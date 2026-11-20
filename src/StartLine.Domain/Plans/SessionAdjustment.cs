using System.Globalization;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>What the runner wants to change about one upcoming run: the time they have, the distance, or the pace.</summary>
public enum AdjustmentKind { Duration, Distance, Pace }

/// <summary>
/// One run, one change. <paramref name="Minutes"/> is the time the runner has (Duration), <paramref name="Km"/> the distance
/// they want (Distance), <paramref name="PaceSecondsPerKm"/> the pace they want to run at (Pace). Only the field for the kind is read.
/// </summary>
public sealed record SessionAdjustmentRequest(DateOnly Date, AdjustmentKind Kind, int? Minutes = null, double? Km = null, int? PaceSecondsPerKm = null);

/// <summary>
/// <see cref="Proposed"/>: a change the rules allow, shown before it's applied. <see cref="NoChangeNeeded"/>: the run already
/// fits what was asked. <see cref="NotRecommended"/>: the rules say no, and <see cref="SessionAdjustmentProposal.Reason"/> says why.
/// </summary>
public enum AdjustmentOutcome { Proposed, NoChangeNeeded, NotRecommended }

/// <summary>
/// The checked answer to a <see cref="SessionAdjustmentRequest"/>: the run before and after, the week's total before and after,
/// the change to save (only when proposed) and a plain sentence. <see cref="SafeLimitKm"/> is the most the run could safely be when
/// a longer run was refused, if any longer run is allowed at all.
/// </summary>
public sealed record SessionAdjustmentProposal(
    AdjustmentOutcome Outcome,
    string Reason,
    PlannedSession Before,
    PlannedSession? After,
    SessionRevision? Change,
    double WeekKmBefore,
    double WeekKmAfter,
    double? SafeLimitKm = null);

/// <summary>
/// Exact changes to one upcoming run: a distance, the minutes the runner has, or a pace. The deterministic authority behind the
/// AI coach: whatever a model or a runner asks for, only what these rules allow can become a change, and it's always previewed
/// first. Shorter and slower are allowed; longer is allowed a little, on steady runs, when nothing says to hold back; faster is
/// never allowed here, because faster paces come from evidence through the weekly coach (<see cref="WeeklyCoach"/>).
/// Hard sessions keep their structure: squeezed into less time or distance they become an easy run, as Life Happens does.
/// Past days, done runs, strength and the race never change. Every threshold is a named constant with a test.
/// </summary>
public static class SessionAdjuster
{
    /// <summary>A steady run can grow by at most this share of what it is now.</summary>
    public const double MaxRunIncreaseShare = 0.2;

    /// <summary>A week can grow by at most this share of its planned distance: the plan's own 10% rule, applied once more.</summary>
    public const double MaxWeekIncreaseShare = 0.1;

    /// <summary>A slower pace is allowed up to this share slower than the slowest of the run's zone; beyond it, walk breaks fit better.</summary>
    public const double MaxSlowerShare = 0.25;

    /// <summary>Pain or a niggle in this many days before today, and nothing grows.</summary>
    public const int PainLookbackDays = 14;

    /// <summary>The range either side of a chosen pace, so a runner has a band to sit in rather than a single number.</summary>
    public const int PaceBandSeconds = 10;

    public const int MinMinutes = 10;
    public const int MaxMinutes = 300;
    public const double MaxKm = 100;
    public const int FastestPaceSeconds = 150;
    public const int SlowestPaceSeconds = 900;

    /// <summary>Recovery runs are short by design: the builder never makes one longer than this.</summary>
    public const double RecoveryCapKm = 8;

    private static readonly SessionType[] Steady = [SessionType.Easy, SessionType.Recovery, SessionType.EasyWithStrides, SessionType.LongRun, SessionType.MediumLongRun];

    /// <summary>A run with one pace from start to finish, which can be lengthened, shortened or slowed and stay what it is.</summary>
    public static bool IsSteady(SessionType type) => Steady.Contains(type);

    /// <summary>The pace zone a steady run is built in.</summary>
    public static PaceZone ZoneOf(SessionType type) => type switch
    {
        SessionType.Recovery => PaceZone.Recovery,
        SessionType.LongRun or SessionType.MediumLongRun => PaceZone.LongRun,
        _ => PaceZone.Easy,
    };

    /// <param name="plan">The plan as the runner sees it, with its saved changes applied.</param>
    /// <param name="checkIns">The plan's check-ins: a done run can't change, and recent pain stops anything growing.</param>
    /// <param name="asWritten">The plan without its saved changes, so growth is always measured from what the plan wrote and
    /// two changes in a row can't compound. Without it, the plan as the runner sees it.</param>
    public static SessionAdjustmentProposal Propose(TrainingPlan plan, DateOnly today, SessionAdjustmentRequest request, IReadOnlyList<SessionCheckIn> checkIns,
        TrainingPlan? asWritten = null)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(checkIns);
        var week = plan.Weeks.FirstOrDefault(w => w.Sessions.Any(s => s.Date == request.Date && Changeable(s)))
            ?? throw new DomainException("Choose one of your runs from today to the next two weeks.");
        var session = week.Sessions.First(s => s.Date == request.Date && Changeable(s));
        if (request.Date < today || request.Date >= today.AddDays(LifeHappens.HorizonDays))
            throw new DomainException("Choose one of your runs from today to the next two weeks.");
        if (checkIns.Any(c => !c.IsAdditional && c.Date == session.Date && c.SessionType == session.Type))
            throw new DomainException("That run is already logged, so it stays as it is.");

        var weekKm = week.Sessions.Sum(s => s.DistanceKm);
        var written = (asWritten ?? plan).Weeks.FirstOrDefault(w => w.StartDate == week.StartDate);
        var writtenWeekKm = written?.Sessions.Sum(s => s.DistanceKm) ?? weekKm;
        var writtenKm = written?.Sessions.FirstOrDefault(s => s.Date == session.Date && s.Type == session.Type)?.DistanceKm ?? session.DistanceKm;
        return request.Kind switch
        {
            AdjustmentKind.Distance => Distance(plan, week, session, today, request.Km, checkIns, weekKm, writtenWeekKm, writtenKm),
            AdjustmentKind.Duration => Duration(plan, week, session, today, request.Minutes, weekKm),
            AdjustmentKind.Pace => PaceChange(plan, week, session, today, request.PaceSecondsPerKm, weekKm),
            _ => throw new DomainException("Choose a time, a distance or a pace."),
        };
    }

    private static bool Changeable(PlannedSession s) => SessionCheckIn.IsCheckable(s.Type);

    private static SessionAdjustmentProposal Distance(TrainingPlan plan, PlanWeek week, PlannedSession session, DateOnly today, double? asked,
        IReadOnlyList<SessionCheckIn> checkIns, double weekKm, double writtenWeekKm, double writtenKm)
    {
        if (asked is not { } raw || !double.IsFinite(raw) || raw < RemainingWeek.MinimumRunKm || raw > MaxKm)
            throw new DomainException($"Choose a distance from {RemainingWeek.MinimumRunKm:0} to {MaxKm:0} km.");
        var km = Quarter(raw);
        if (Math.Abs(km - session.DistanceKm) < 0.125)
            return Same(session, weekKm, $"{session.Title} is already {Km(session.DistanceKm)}.");

        if (km < session.DistanceKm)
        {
            return IsSteady(session.Type)
                ? Keep(plan, session, today, km, null, weekKm, $"{session.Title} becomes {Km(km)}, at the same pace.")
                : Ease(plan, session, today, km, weekKm,
                    $"A {session.Title.ToLowerInvariant()} doesn't fit into {Km(km)}, so it becomes an easy {Km(km)}. Hard work isn't squeezed into less.");
        }

        // Longer: only a steady run, a little, outside the taper, with no pain lately and the week still within its own rule.
        if (!IsSteady(session.Type))
            return No(session, weekKm, $"A {session.Title.ToLowerInvariant()} keeps its distance: its reps and recoveries are built to it. A longer easy day is safer than a longer hard one.");
        if (week.Phase is TrainingPhase.Taper or TrainingPhase.RaceWeek)
            return No(session, weekKm, "You're tapering: runs get shorter now so you're fresh on race day. Longer runs wait for the next build.");
        var from = today.AddDays(-PainLookbackDays);
        if (checkIns.Any(c => c.Date >= from && c.Date <= today && c.Pain is PainLevel.Niggle or PainLevel.ChangedRunning))
            return No(session, weekKm, "You've noted pain or a niggle in the last two weeks, so nothing grows until it settles.");

        var limit = SafeLimit(plan, week, session, weekKm, writtenWeekKm, writtenKm);
        if (km > limit + 0.001)
        {
            var reason = limit >= session.DistanceKm + 0.25
                ? $"{Km(km)} is more than this run should grow in one go. The most it can safely be is {Km(limit)}."
                : $"{session.Title} can't grow this week without breaking the plan's 10% rule.";
            return new(AdjustmentOutcome.NotRecommended, reason, session, null, null, weekKm, weekKm, limit >= session.DistanceKm + 0.25 ? limit : null);
        }

        return Keep(plan, session, today, km, null, weekKm, $"{session.Title} grows to {Km(km)}, at the same pace. Your week stays within the plan's 10% rule.");
    }

    /// <summary>
    /// The longest a steady run may become: its own growth limit and the week's (both from the plan as written, so changes
    /// can't compound), the longest run in the plan, the week's long run and the recovery cap.
    /// </summary>
    public static double SafeLimit(TrainingPlan plan, PlanWeek week, PlannedSession session, double weekKm, double writtenWeekKm, double writtenKm)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(week);
        ArgumentNullException.ThrowIfNull(session);
        var ownLimit = writtenKm * (1 + MaxRunIncreaseShare);
        var weekLimit = session.DistanceKm + Math.Max(0, (writtenWeekKm * (1 + MaxWeekIncreaseShare)) - weekKm);
        var longest = plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Type is not SessionType.Race).Max(s => s.DistanceKm);
        var limit = Math.Min(Math.Min(ownLimit, weekLimit), longest);
        if (session.Type == SessionType.Recovery) limit = Math.Min(limit, RecoveryCapKm);
        // A long run never grows past the plan's longest; any other run never becomes as long as the week's long run.
        if (session.Type is not (SessionType.LongRun or SessionType.MediumLongRun))
        {
            var longRun = week.Sessions.Where(s => s.Type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace).Select(s => s.DistanceKm).DefaultIfEmpty(double.MaxValue).Max();
            limit = Math.Min(limit, longRun - 1);
        }

        return Math.Max(session.DistanceKm, Math.Floor(limit * 4) / 4);
    }

    private static SessionAdjustmentProposal Duration(TrainingPlan plan, PlanWeek week, PlannedSession session, DateOnly today, int? minutes, double weekKm)
    {
        _ = week;
        if (minutes is not { } m || m < MinMinutes || m > MaxMinutes)
            throw new DomainException($"Choose from {MinMinutes} to {MaxMinutes} minutes.");
        // Judged at the slow end of the run's own pace, so the time is enough even on a tired day.
        var zone = IsSteady(session.Type) ? ZoneOf(session.Type) : PaceZone.Easy;
        var slowest = plan.Paces[zone].Slowest.SecondsPerKilometre;
        var needs = TimeSpan.FromSeconds(session.DistanceKm * (IsSteady(session.Type) ? slowest : HardSessionSecondsPerKm(plan)));
        if (TimeSpan.FromMinutes(m) >= needs)
            return Same(session, weekKm, $"{m} minutes is enough for {session.Title.ToLowerInvariant()} as written (about {Minutes(needs)}).");

        var km = Math.Floor(m * 60 / slowest * 4) / 4;
        if (km < RemainingWeek.MinimumRunKm)
        {
            var rest = new SessionRevision(today, session.Date, session.Type, session.Title, session.DistanceKm, null);
            return new(AdjustmentOutcome.Proposed, $"{m} minutes is too short for a useful run here, so this becomes a rest day.", session, null, rest, weekKm, weekKm - session.DistanceKm);
        }

        return IsSteady(session.Type)
            ? Keep(plan, session, today, km, null, weekKm, $"{session.Title} becomes {Km(km)}: it fits in {m} minutes at your {ZoneWord(zone)} pace.")
            : Ease(plan, session, today, km, weekKm, $"A {session.Title.ToLowerInvariant()} needs about {Minutes(needs)}. In {m} minutes, run an easy {Km(km)} instead: hard work isn't squeezed into less time.");
    }

    // Warm-up, the work and the recoveries average out near the slow end of easy pace: a deliberately generous estimate.
    private static double HardSessionSecondsPerKm(TrainingPlan plan) => plan.Paces[PaceZone.Easy].Slowest.SecondsPerKilometre;

    private static SessionAdjustmentProposal PaceChange(TrainingPlan plan, PlanWeek week, PlannedSession session, DateOnly today, int? pace, double weekKm)
    {
        _ = week;
        if (pace is not { } seconds || seconds < FastestPaceSeconds || seconds > SlowestPaceSeconds)
            throw new DomainException("Choose a pace between 2:30 and 15:00 per km.");
        if (!IsSteady(session.Type))
            return No(session, weekKm, $"A {session.Title.ToLowerInvariant()} keeps its paces: they're what makes it work. The weekly coach updates them when your logged and uploaded runs show you're ready.");
        var zone = ZoneOf(session.Type);
        var range = plan.Paces[zone];
        var (fastest, slowest) = (range.Fastest.SecondsPerKilometre, range.Slowest.SecondsPerKilometre);
        if (seconds >= Math.Round(fastest) && seconds <= Math.Round(slowest))
            return Same(session, weekKm, $"{Pace(seconds)} is already inside your {ZoneWord(zone)} pace of {Pace(fastest)} to {Pace(slowest)}.");
        if (seconds < fastest)
            return No(session, weekKm, $"{ZoneWordCapital(zone)} runs stay easy: running them faster adds tiredness, not fitness. When your logged or uploaded runs show you're fitter, the weekly coach speeds up your paces for you.");
        if (seconds > slowest * (1 + MaxSlowerShare))
            return No(session, weekKm, $"{Pace(seconds)} is much slower than this run is built for. Walk breaks keep the effort right without changing the run: try run/walk instead.");

        var band = (Math.Max(fastest, seconds - PaceBandSeconds), (double)seconds + PaceBandSeconds);
        return Keep(plan, session, today, session.DistanceKm, band, weekKm, $"{session.Title} stays {Km(session.DistanceKm)}, at {Pace(band.Item1)} to {Pace(band.Item2)} instead of {Pace(fastest)} to {Pace(slowest)}.");
    }

    private static SessionAdjustmentProposal Keep(TrainingPlan plan, PlannedSession session, DateOnly today, double km, (double Fastest, double Slowest)? pace, double weekKm, string reason)
    {
        var zone = ZoneOf(session.Type);
        var current = plan.Paces[zone];
        var (fast, slow) = pace ?? (current.Fastest.SecondsPerKilometre, current.Slowest.SecondsPerKilometre);
        var change = new SessionRevision(today, session.Date, session.Type, session.Title, session.DistanceKm, km, fast, slow, Type: session.Type);
        var after = RemainingWeek.Apply(plan, [change]).Weeks.SelectMany(w => w.Sessions).First(s => s.Date == session.Date && s.Type == session.Type);
        return new(AdjustmentOutcome.Proposed, reason, session, after, change, weekKm, weekKm - session.DistanceKm + km);
    }

    private static SessionAdjustmentProposal Ease(TrainingPlan plan, PlannedSession session, DateOnly today, double km, double weekKm, string reason)
    {
        var easy = plan.Paces[PaceZone.Easy];
        var change = new SessionRevision(today, session.Date, session.Type, session.Title, session.DistanceKm, km, easy.Fastest.SecondsPerKilometre, easy.Slowest.SecondsPerKilometre);
        var after = RemainingWeek.Apply(plan, [change]).Weeks.SelectMany(w => w.Sessions).First(s => s.Date == session.Date && SessionCheckIn.IsCheckable(s.Type));
        return new(AdjustmentOutcome.Proposed, reason, session, after, change, weekKm, weekKm - session.DistanceKm + km);
    }

    private static SessionAdjustmentProposal Same(PlannedSession session, double weekKm, string reason) =>
        new(AdjustmentOutcome.NoChangeNeeded, reason, session, null, null, weekKm, weekKm);

    private static SessionAdjustmentProposal No(PlannedSession session, double weekKm, string reason) =>
        new(AdjustmentOutcome.NotRecommended, reason, session, null, null, weekKm, weekKm);

    private static double Quarter(double km) => Math.Round(km * 4, MidpointRounding.AwayFromZero) / 4;

    private static string Km(double km) => $"{km.ToString("0.##", CultureInfo.InvariantCulture)} km";

    private static string Minutes(TimeSpan time) => $"{Math.Ceiling(time.TotalMinutes).ToString(CultureInfo.InvariantCulture)} minutes";

    private static string Pace(double secondsPerKm)
    {
        var total = (int)Math.Round(secondsPerKm);
        return $"{(total / 60).ToString(CultureInfo.InvariantCulture)}:{(total % 60).ToString("00", CultureInfo.InvariantCulture)}/km";
    }

    private static string ZoneWord(PaceZone zone) => zone switch
    {
        PaceZone.Recovery => "recovery",
        PaceZone.LongRun => "long-run",
        _ => "easy",
    };

    private static string ZoneWordCapital(PaceZone zone) => zone switch
    {
        PaceZone.Recovery => "Recovery",
        PaceZone.LongRun => "Long",
        _ => "Easy",
    };
}
