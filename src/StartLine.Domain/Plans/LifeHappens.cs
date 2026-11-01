using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public enum LifeSituation { MissedRun, ShortOnTime, Travelling, Unwell, MoveLongRun }

/// <summary>
/// What the runner says happened. <paramref name="Date"/> is the missed run, the short day, or the first travel day;
/// <paramref name="Until"/> the last travel day; <paramref name="Days"/> how many days unwell, from today;
/// <paramref name="MoveTo"/> the day to run a missed or moved session instead.
/// </summary>
public sealed record LifeChange(LifeSituation Situation, DateOnly? Date = null, DateOnly? Until = null, int? Minutes = null, bool CanRun = true, int? Days = null, DateOnly? MoveTo = null);

/// <summary>The changes a situation suggests, and for a move, the days it could safely go to.</summary>
public sealed record LifeProposal(IReadOnlyList<SessionRevision> Changes, IReadOnlyList<DateOnly> MoveTargets);

/// <summary>
/// Life happens: a missed run, a short day, travel, illness or a long run that has to move. Each turns into real changes
/// to upcoming sessions, previewed before they're applied and undone one day at a time. The rules keep a hard day off the
/// day either side of another hard day, never make up missed kilometres, and never touch a session already done, a
/// past day, strength or the race.
/// </summary>
public static class LifeHappens
{
    public const int HorizonDays = 14;
    public const double TravelEasyCapKm = 8;
    public const double ComebackCapKm = 5;
    public const int ComebackSessions = 2;
    public static readonly IReadOnlyList<int> ShortMinutes = [20, 30, 45, 60];

    private static readonly SessionType[] Gentle = [SessionType.Easy, SessionType.Recovery, SessionType.EasyWithStrides, SessionType.Shakeout, SessionType.Strength];

    /// <summary>Anything that isn't easy running or strength needs an easy day either side.</summary>
    public static bool IsHard(SessionType type) => !Gentle.Contains(type);

    public static LifeProposal Propose(TrainingPlan plan, DateOnly today, LifeChange change, IReadOnlyList<SessionCheckIn> checkIns)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(change);
        ArgumentNullException.ThrowIfNull(checkIns);
        var sessions = plan.Weeks.SelectMany(w => w.Sessions).ToList();
        var runs = sessions.Where(s => SessionCheckIn.IsCheckable(s.Type) && s.Type != SessionType.Strength).ToList();
        bool Done(PlannedSession s) => checkIns.Any(c => !c.IsAdditional && c.Date == s.Date && c.SessionType == s.Type);
        var open = runs.Where(s => s.Date >= today && s.Date < today.AddDays(HorizonDays) && s.Type != SessionType.Race && !Done(s)).ToList();
        var pace = plan.Paces[PaceZone.Easy];

        SessionRevision Revise(PlannedSession s, double? km) =>
            new(today, s.Date, s.Type, s.Title, s.DistanceKm, km is null ? null : Math.Min(km.Value, s.DistanceKm), pace.Fastest.SecondsPerKilometre, pace.Slowest.SecondsPerKilometre);

        switch (change.Situation)
        {
            case LifeSituation.ShortOnTime:
                {
                    var session = open.FirstOrDefault(s => s.Date == change.Date) ?? throw new DomainException("Choose a run from today on that isn't done yet.");
                    if (change.Minutes is not { } minutes || !ShortMinutes.Contains(minutes)) throw new DomainException("Choose 20, 30, 45 or 60 minutes.");
                    // Easy running for the time there is: hard work isn't squeezed into less time.
                    var km = Math.Floor(minutes * 60 / pace.Slowest.SecondsPerKilometre * 4) / 4;
                    return km >= session.DistanceKm && !IsHard(session.Type)
                        ? new([], [])
                        : new([Revise(session, km < RemainingWeek.MinimumRunKm ? null : km)], []);
                }

            case LifeSituation.Travelling:
                {
                    if (change.Date is not { } from || change.Until is not { } until || until < from || from < today || until >= today.AddDays(HorizonDays))
                        throw new DomainException($"Choose travel days from today to the next {HorizonDays} days.");
                    var away = open.Where(s => s.Date >= from && s.Date <= until).ToList();
                    return new([.. away
                    .Where(s => !change.CanRun || IsHard(s.Type) || s.DistanceKm > TravelEasyCapKm)
                    .Select(s => Revise(s, change.CanRun ? Math.Min(s.DistanceKm, TravelEasyCapKm) : null))], []);
                }

            case LifeSituation.Unwell:
                {
                    if (change.Days is not (>= 1 and <= 7) || change.Days is not { } days) throw new DomainException("Choose 1 to 7 days.");
                    // Rest while unwell, then come back easy and short for the next couple of runs.
                    var resting = open.Where(s => s.Date < today.AddDays(days)).Select(s => Revise(s, null));
                    var comeback = open.Where(s => s.Date >= today.AddDays(days)).Take(ComebackSessions)
                        .Where(s => IsHard(s.Type) || s.DistanceKm > ComebackCapKm)
                        .Select(s => Revise(s, Math.Min(s.DistanceKm, ComebackCapKm)));
                    return new([.. resting.Concat(comeback)], []);
                }

            case LifeSituation.MissedRun:
                {
                    var missed = runs.FirstOrDefault(s => s.Date == change.Date && s.Date < today && s.Date >= WeekStart(plan, today) && s.Type != SessionType.Race)
                        ?? throw new DomainException("Choose a run from earlier this week.");
                    if (Done(missed)) throw new DomainException("That run is already logged.");
                    // Easy runs are let go: missed kilometres are never made up. A key session can move to a safe free day.
                    var targets = IsHard(missed.Type) ? SafeDays(plan, runs, today, missed, ignore: null) : [];
                    return Moved(missed, targets, change.MoveTo, today, restSource: false);
                }

            case LifeSituation.MoveLongRun:
                {
                    var longRun = open.Where(s => s.Date < WeekStart(plan, today).AddDays(7))
                        .FirstOrDefault(s => s.Type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace or SessionType.MediumLongRun)
                        ?? throw new DomainException("There's no long run left to move this week.");
                    return Moved(longRun, SafeDays(plan, runs, today, longRun, ignore: longRun.Date), change.MoveTo, today, restSource: true);
                }

            default:
                throw new DomainException("Choose what happened.");
        }
    }

    private static LifeProposal Moved(PlannedSession session, IReadOnlyList<DateOnly> targets, DateOnly? moveTo, DateOnly today, bool restSource)
    {
        if (moveTo is not { } to)
        {
            return new([], targets);
        }

        if (!targets.Contains(to))
        {
            throw new DomainException("Choose one of the days offered: they keep an easy day either side of a hard one.");
        }

        List<SessionRevision> changes = [new(today, to, session.Type, session.Title, session.DistanceKm, session.DistanceKm, MovedFrom: session.Date)];
        if (restSource)
        {
            changes.Insert(0, new(today, session.Date, session.Type, session.Title, session.DistanceKm, null));
        }

        return new(changes, targets);
    }

    /// <summary>
    /// Free days left this week (from today, no run planned) where a hard session fits: no hard run the day before or after,
    /// and not the day before the race. <paramref name="ignore"/> is the session's own day when it's moving.
    /// </summary>
    private static List<DateOnly> SafeDays(TrainingPlan plan, IReadOnlyList<PlannedSession> runs, DateOnly today, PlannedSession session, DateOnly? ignore)
    {
        var end = WeekStart(plan, today).AddDays(6);
        bool HardOn(DateOnly day) => runs.Any(r => r.Date == day && r.Date != ignore && IsHard(r.Type));
        return [.. Enumerable.Range(0, end.DayNumber - today.DayNumber + 1).Select(today.AddDays)
            .Where(day => day != ignore && day != session.Date && !runs.Any(r => r.Date == day))
            .Where(day => !HardOn(day.AddDays(-1)) && !HardOn(day.AddDays(1)) && day.AddDays(1) != plan.RaceDate && day < plan.RaceDate)];
    }

    private static DateOnly WeekStart(TrainingPlan plan, DateOnly today) =>
        plan.Weeks.FirstOrDefault(w => w.StartDate <= today && today < w.StartDate.AddDays(7))?.StartDate ?? today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
}
