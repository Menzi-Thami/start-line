using StartLine.Domain.Common;

namespace StartLine.Domain.Journey;

public sealed record MaintenanceSession(
    DateOnly Date,
    MaintenanceSessionKind Kind,
    string Title,
    string Guidance,
    int MinMinutes,
    int MaxMinutes,
    bool Optional);

public sealed record MaintenanceWeek(DateOnly WeekStart, IReadOnlyList<MaintenanceSession> Sessions);

/// <summary>
/// "Keep running comfortably", version 1: easy, conversational runs on the runner's days and nothing hard. No race date,
/// no paces, no intervals; every session optional. Pure: the same answers and "today" always give the same weeks.
/// </summary>
public static class MaintenanceGenerator
{
    public const int Version = 1;
    public const int MinDaysPerWeek = 2;
    public const int MaxDaysPerWeek = 4;

    /// <summary>The current week and the next three.</summary>
    public const int WeeksShown = 4;

    public const int EasyMinMinutes = 25;
    public const int EasyMaxMinutes = 40;
    public const int LongerMinMinutes = 40;
    public const int LongerMaxMinutes = 60;
    public const int StrengthMinMinutes = 20;
    public const int StrengthMaxMinutes = 30;

    /// <summary>
    /// The days to run on: <paramref name="daysPerWeek"/> of the runner's chosen days, spread out. Without a choice, the
    /// <paramref name="fallback"/> days (their last plan's), else Tuesday, Thursday, Saturday and Sunday.
    /// </summary>
    public static IReadOnlyList<DayOfWeek> DaysFor(int daysPerWeek, IReadOnlyList<DayOfWeek>? chosen, IReadOnlyList<DayOfWeek>? fallback = null)
    {
        if (daysPerWeek is < MinDaysPerWeek or > MaxDaysPerWeek)
        {
            throw new DomainException($"Choose between {MinDaysPerWeek} and {MaxDaysPerWeek} runs a week.");
        }

        var picked = JourneyDays.Ordered(chosen);
        if (picked.Count > 0)
        {
            return picked.Count < daysPerWeek
                ? throw new DomainException($"Choose at least {daysPerWeek} days to run on.")
                : JourneyDays.Spread(picked, daysPerWeek);
        }

        var days = JourneyDays.Ordered(fallback).ToList();
        if (days.Count < daysPerWeek)
        {
            days.AddRange(JourneyDays.Default.Where(d => !days.Contains(d)));
        }

        return JourneyDays.Spread(JourneyDays.Ordered(days), daysPerWeek);
    }

    public static IReadOnlyList<MaintenanceWeek> Build(IReadOnlyList<DayOfWeek> runDays, bool includeStrength, DateOnly startedOn, DateOnly today)
    {
        ArgumentNullException.ThrowIfNull(runDays);
        var ordered = JourneyDays.Ordered(runDays);
        DayOfWeek? longer = ordered.Count >= 3 ? ordered[^1] : null;
        var strength = includeStrength ? StrengthDay(ordered, longer) : null;
        var first = JourneyDays.MondayOf(today > startedOn ? today : startedOn);
        return [.. Enumerable.Range(0, WeeksShown).Select(w =>
        {
            var weekStart = first.AddDays(7 * w);
            var sessions = Enumerable.Range(0, 7)
                .Select(weekStart.AddDays)
                .Where(date => date >= startedOn)
                .SelectMany(date =>
                {
                    // A runner may start this immediately after a race. Ease into optional runs rather
                    // than placing a 40–60 minute longer run on the very first day.
                    var daysSinceStart = date.DayNumber - startedOn.DayNumber;
                    if (daysSinceStart < 2) return Enumerable.Empty<MaintenanceSession>();
                    var sessions = SessionsOn(date, ordered, longer, strength);
                    return daysSinceStart < 7 ? sessions.Where(s => s.Kind != MaintenanceSessionKind.LongerEasyRun) : sessions;
                })
                .ToList();
            return new MaintenanceWeek(weekStart, sessions);
        })];
    }

    private static IEnumerable<MaintenanceSession> SessionsOn(DateOnly date, IReadOnlyList<DayOfWeek> runDays, DayOfWeek? longer, DayOfWeek? strength)
    {
        if (date.DayOfWeek == longer)
        {
            yield return new(date, MaintenanceSessionKind.LongerEasyRun, "Longer easy run",
                $"{LongerMinMinutes}–{LongerMaxMinutes} minutes at an easy, conversational effort. No pace to hit; walk breaks are fine.",
                LongerMinMinutes, LongerMaxMinutes, Optional: true);
        }
        else if (runDays.Contains(date.DayOfWeek))
        {
            yield return new(date, MaintenanceSessionKind.EasyRun, "Easy run",
                $"{EasyMinMinutes}–{EasyMaxMinutes} minutes at an easy pace you could chat at.",
                EasyMinMinutes, EasyMaxMinutes, Optional: true);
        }
        else if (date.DayOfWeek == strength)
        {
            yield return new(date, MaintenanceSessionKind.Strength, "Strength",
                $"{StrengthMinMinutes}–{StrengthMaxMinutes} minutes of easy strength work: squats, lunges, calf raises and core. Nothing to failure.",
                StrengthMinMinutes, StrengthMaxMinutes, Optional: true);
        }
    }

    /// <summary>A day off running, not the day before the longer run where there's a choice.</summary>
    private static DayOfWeek? StrengthDay(IReadOnlyList<DayOfWeek> runDays, DayOfWeek? longer)
    {
        var free = Enumerable.Range(0, 7).Select(i => (DayOfWeek)((i + 1) % 7)).Where(d => !runDays.Contains(d)).ToList();
        var beforeLonger = longer is { } l ? (DayOfWeek)(((int)l + 6) % 7) : (DayOfWeek?)null;
        return free.Where(d => d != beforeLonger).Cast<DayOfWeek?>().FirstOrDefault() ?? free.Cast<DayOfWeek?>().FirstOrDefault();
    }
}
