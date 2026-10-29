using System.Globalization;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Running;

namespace StartLine.Domain.Notifications;

/// <summary>One push: the runner's date it's for, and what it says.</summary>
public sealed record Reminder(DateOnly Date, string Title, string Body);

/// <summary>
/// How last week went, as far as a reminder may say: the runs the plan asked for, how many were run, and the planned
/// distance. Where run data may be pushed, <c>KmRun</c> is the distance recorded and a run counts when it was checked in
/// or recorded; without it, <c>KmRun</c> is null and only check-ins count.
/// </summary>
public sealed record LastWeek(int RunsPlanned, int RunsDone, double KmPlanned, double? KmRun = null);

/// <summary>
/// What a reminder is made from: the plan (as written, or as the coach has it where run data may be pushed), the runner's
/// units, and on a Monday last week's check-ins and the coach's call in words, when there are any.
/// </summary>
public sealed record ReminderFacts(TrainingPlan Plan, Units Units, LastWeek? LastWeek = null, string? CoachSays = null);

/// <summary>
/// Which reminder a device is due, and what it says. When is from the plan's days and the runner's own clock; what is
/// from <see cref="ReminderFacts"/> only, so a reminder can never say more than the application chose to give it.
/// A day has at most one reminder, sent once: the run, race day, or on a Monday the new week as well.
/// </summary>
public static class Reminders
{
    /// <summary>How far ahead <see cref="NextDue"/> looks for a day with something to say before it says "look again then".</summary>
    public const int LookAheadDays = 28;

    public const string RaceTitle = "Race day";
    public const string NoCoachYet = "Open Taperday for your coach’s note on the week.";

    private const double KmPerMile = 1.609344;

    /// <summary>
    /// The day whose reminder is due now, if any: today's, once its time has come, and only if it hasn't gone already. A
    /// late check still sends it, the same day.
    /// </summary>
    /// <param name="localNow">The runner's own time now.</param>
    public static DateOnly? DueDay(PushSubscription subscription, TrainingPlan? plan, DateTime localNow)
    {
        ArgumentNullException.ThrowIfNull(subscription);
        var today = DateOnly.FromDateTime(localNow);
        return plan is null
            || subscription.LastRemindedOn >= today
            || TimeOnly.FromDateTime(localNow) < subscription.RemindAt
            || !HasSomethingToSay(plan, today, subscription.WeekAhead, subscription.Daily)
            ? null
            : today;
    }

    /// <summary>The reminder due now, if any, said from <paramref name="facts"/>.</summary>
    public static Reminder? Due(PushSubscription subscription, ReminderFacts? facts, DateTime localNow)
    {
        ArgumentNullException.ThrowIfNull(subscription);
        return DueDay(subscription, facts?.Plan, localNow) is { } day ? For(facts!, day, subscription.WeekAhead, subscription.Daily) : null;
    }

    /// <summary>
    /// When the next reminder is due, in the runner's own time: now when one is due already. Null when none ever will be
    /// (no plan, or it's over). With nothing in the next <see cref="LookAheadDays"/> days, the time to look again.
    /// </summary>
    public static DateTime? NextDue(PushSubscription subscription, TrainingPlan? plan, DateTime localNow)
    {
        ArgumentNullException.ThrowIfNull(subscription);
        if (plan is null)
        {
            return null;
        }

        var today = DateOnly.FromDateTime(localNow);
        var horizon = today.AddDays(LookAheadDays);
        for (var day = today; day <= plan.RaceDate && day < horizon; day = day.AddDays(1))
        {
            if (subscription.LastRemindedOn >= day || !HasSomethingToSay(plan, day, subscription.WeekAhead, subscription.Daily))
            {
                continue;
            }

            var at = day.ToDateTime(subscription.RemindAt);
            return at < localNow ? localNow : at;
        }

        return horizon <= plan.RaceDate ? horizon.ToDateTime(subscription.RemindAt) : null;
    }

    /// <summary>What a day's reminder says. Null on a rest day (strength alone is not a run), unless it opens a new week.</summary>
    public static Reminder? For(ReminderFacts facts, DateOnly day, bool weekAhead, bool daily = false)
    {
        ArgumentNullException.ThrowIfNull(facts);
        var plan = facts.Plan;
        var runs = RunsOn(plan, day);
        if (runs.FirstOrDefault(s => s.Type == SessionType.Race) is { } race)
        {
            var goal = plan.Paces.TryGetValue(PaceZone.Race, out var pace) ? $" Goal pace {PaceText(pace, facts.Units)}." : "";
            return new Reminder(day, RaceTitle, $"{race.Detail}{goal}");
        }

        if (weekAhead && OpensAWeek(plan, day) is { } week)
        {
            return new Reminder(day, WeekTitle(plan, week), WeekBody(facts, week, runs));
        }

        return runs.Count == 0
            ? daily && day >= plan.StartDate && day <= plan.RaceDate ? RecoveryDay(plan, day) : null
            : new Reminder(day, $"Today: {string.Join(" + ", runs.Select(s => s.Title))}", RunsBody(runs, plan, facts.Units));
    }

    private static Reminder RecoveryDay(TrainingPlan plan, DateOnly day)
    {
        var strength = plan.Weeks.SelectMany(w => w.Sessions).FirstOrDefault(s => s.Date == day && s.Type == SessionType.Strength);
        return strength is not null ? new(day, "Today: Strength", $"No run scheduled. {strength.Detail}")
            : new(day, "Recovery day", "No run scheduled today. Rest is part of your training. Let your body recover; there is no need to make up missed kilometres.");
    }

    private static List<PlannedSession> RunsOn(TrainingPlan plan, DateOnly day) =>
        [.. plan.Weeks.SelectMany(w => w.Sessions).Where(s => s.Date == day && s.Type != SessionType.Strength)];

    private static bool HasSomethingToSay(TrainingPlan plan, DateOnly day, bool weekAhead, bool daily = false) =>
        RunsOn(plan, day).Count > 0 || (weekAhead && OpensAWeek(plan, day) is not null) || daily && day >= plan.StartDate && day <= plan.RaceDate;

    /// <summary>
    /// The week a Monday starts, if it's after the first and short of race week: the weeks the coach makes a call on, so
    /// the note has something new to say.
    /// </summary>
    private static PlanWeek? OpensAWeek(TrainingPlan plan, DateOnly day) =>
        day.DayOfWeek == DayOfWeek.Monday && plan.Weeks.Any(w => w.StartDate < day)
            ? plan.Weeks.FirstOrDefault(w => w.StartDate == day && w.Phase != TrainingPhase.RaceWeek)
            : null;

    /// <summary>One run: its distance and pace, then the plan's own words for it. Two: each, briefly.</summary>
    private static string RunsBody(List<PlannedSession> runs, TrainingPlan plan, Units units) =>
        runs.Count == 1
            ? $"{Measure(runs[0], plan, units)}. {runs[0].Detail}"
            : string.Join(" Then ", runs.Select(s => $"{s.Title}: {Measure(s, plan, units)}."));

    private static string Measure(PlannedSession session, TrainingPlan plan, Units units) =>
        session.Zone is { } zone && plan.Paces.TryGetValue(zone, out var pace)
            ? $"{Distance(session.DistanceKm, units)} at {PaceText(pace, units)}"
            : Distance(session.DistanceKm, units);

    private static string WeekTitle(TrainingPlan plan, PlanWeek week) =>
        $"Week {week.Number} of {plan.Weeks.Count} · {PhaseName(week.Phase)}{(week.IsCutback ? " (easier week)" : "")}";

    /// <summary>The coach's call, last week, this week, then today: most useful first, as a lock screen cuts the end off.</summary>
    private static string WeekBody(ReminderFacts facts, PlanWeek week, List<PlannedSession> today)
    {
        List<string> lines = [facts.CoachSays is { Length: > 0 } coach ? $"Coach: {coach}" : NoCoachYet];
        if (facts.LastWeek is { RunsPlanned: > 0 } last)
        {
            if (last.KmRun is { } ran)
            {
                lines.Add($"Last week: {last.RunsDone} of {last.RunsPlanned} runs, {Distance(ran, facts.Units)} of {Distance(last.KmPlanned, facts.Units)}.");
            }
            else if (last.RunsDone > 0)
            {
                // Check-ins alone: a run recorded but not checked in isn't counted here, so this says only what it knows.
                lines.Add($"Last week you checked in {last.RunsDone} of {last.RunsPlanned} runs.");
            }
        }

        lines.Add($"This week: {ThisWeek(week, facts.Units)}.");
        if (today.Count > 0)
        {
            lines.Add($"Today: {string.Join(" + ", today.Select(s => s.Title))}, {Distance(today.Sum(s => s.DistanceKm), facts.Units)}.");
        }

        return string.Join(" ", lines);
    }

    /// <summary>"42 km, with Intervals on Wednesday and a 16 km long run on Sunday".</summary>
    private static string ThisWeek(PlanWeek week, Units units)
    {
        var runs = week.Sessions.Where(s => s.Type != SessionType.Strength).ToList();
        var key = runs.Where(s => IsHard(s.Type)).Select(s => $"{s.Title} on {s.Date.DayOfWeek}").ToList();
        if (runs.Where(s => IsLong(s.Type)).OrderByDescending(s => s.DistanceKm).FirstOrDefault() is { } longRun)
        {
            key.Add($"a {Distance(longRun.DistanceKm, units)} long run on {longRun.Date.DayOfWeek}");
        }

        var total = Distance(runs.Sum(s => s.DistanceKm), units);
        return key.Count == 0 ? $"{total}, all easy" : $"{total}, with {JoinedWithAnd(key)}";
    }

    private static bool IsHard(SessionType type) => type is SessionType.Hills or SessionType.Fartlek or SessionType.Intervals
        or SessionType.Tempo or SessionType.CruiseIntervals or SessionType.ProgressionRun or SessionType.RacePace;

    private static bool IsLong(SessionType type) =>
        type is SessionType.LongRun or SessionType.LongRunFastFinish or SessionType.LongRunRacePace;

    private static string PhaseName(TrainingPhase phase) => phase switch
    {
        TrainingPhase.Base => "Base",
        TrainingPhase.Build => "Build",
        TrainingPhase.Peak => "Peak",
        TrainingPhase.Taper => "Taper",
        _ => "Race week",
    };

    private static string JoinedWithAnd(List<string> parts) =>
        parts.Count == 1 ? parts[0] : $"{string.Join(", ", parts.Take(parts.Count - 1))} and {parts[^1]}";

    /// <summary>A distance in the runner's units, to a tenth: "8 km", "5.2 mi".</summary>
    public static string Distance(double km, Units units) => units == Units.Miles
        ? $"{(km / KmPerMile).ToString("0.#", CultureInfo.InvariantCulture)} mi"
        : $"{km.ToString("0.#", CultureInfo.InvariantCulture)} km";

    /// <summary>A pace range in the runner's units: "4:55–5:05/km".</summary>
    public static string PaceText(PaceRange range, Units units)
    {
        ArgumentNullException.ThrowIfNull(range);
        var per = units == Units.Miles ? KmPerMile : 1;
        var fastest = Clock(range.Fastest.SecondsPerKilometre * per);
        var slowest = Clock(range.Slowest.SecondsPerKilometre * per);
        var unit = units == Units.Miles ? "mi" : "km";
        return fastest == slowest ? $"{fastest}/{unit}" : $"{fastest}–{slowest}/{unit}";
    }

    private static string Clock(double seconds)
    {
        var whole = (int)Math.Round(seconds);
        return string.Create(CultureInfo.InvariantCulture, $"{whole / 60}:{whole % 60:00}");
    }
}
