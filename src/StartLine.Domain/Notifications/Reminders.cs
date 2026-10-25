using StartLine.Domain.Plans;

namespace StartLine.Domain.Notifications;

/// <summary>One push: the runner's date it's for, and what it says.</summary>
public sealed record Reminder(DateOnly Date, string Title, string Body);

/// <summary>
/// Which reminder a device is due, from the runner's plan as written and their own clock. Never from their runs: what a
/// reminder says comes from the plan alone, so nothing synced from Strava (or uploaded) ever leaves in a notification.
/// A day has at most one reminder, sent once: the run, race day, or on a Monday the new week as well.
/// </summary>
public static class Reminders
{
    /// <summary>How far ahead <see cref="NextDue"/> looks for a day with something to say before it says "look again then".</summary>
    public const int LookAheadDays = 28;

    public const string RunTitle = "Today’s run";
    public const string RaceTitle = "Race day";
    public const string RaceBody = "Everything you’ve run was for this. Go and enjoy it.";
    public const string NewWeekTitle = "A new week of training";
    public const string NewWeekBody = "Your coach’s note on the week is waiting.";

    /// <summary>The reminder due now, if any: today's, once its time has come, and only if it hasn't gone already. A late check still sends it, the same day.</summary>
    /// <param name="localNow">The runner's own time now.</param>
    public static Reminder? Due(PushSubscription subscription, TrainingPlan? plan, DateTime localNow)
    {
        ArgumentNullException.ThrowIfNull(subscription);
        var today = DateOnly.FromDateTime(localNow);
        if (plan is null || subscription.LastRemindedOn >= today || TimeOnly.FromDateTime(localNow) < subscription.RemindAt)
        {
            return null;
        }

        return For(plan, today, subscription.WeekAhead);
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
            if (subscription.LastRemindedOn >= day || For(plan, day, subscription.WeekAhead) is null)
            {
                continue;
            }

            var at = day.ToDateTime(subscription.RemindAt);
            return at < localNow ? localNow : at;
        }

        return horizon <= plan.RaceDate ? horizon.ToDateTime(subscription.RemindAt) : null;
    }

    /// <summary>What a day's reminder says. Null on a rest day (strength alone is not a run), unless it opens a new week.</summary>
    public static Reminder? For(TrainingPlan plan, DateOnly day, bool weekAhead)
    {
        ArgumentNullException.ThrowIfNull(plan);
        var runs = plan.Weeks
            .SelectMany(w => w.Sessions)
            .Where(s => s.Date == day && s.Type != SessionType.Strength)
            .ToList();
        if (runs.Any(s => s.Type == SessionType.Race))
        {
            return new Reminder(day, RaceTitle, RaceBody);
        }

        var run = runs.Count == 0 ? null : string.Join(" and ", runs.Select(s => s.Title));
        if (weekAhead && OpensAWeek(plan, day))
        {
            return new Reminder(day, NewWeekTitle, run is null ? NewWeekBody : $"Today: {run}. {NewWeekBody}");
        }

        return run is null ? null : new Reminder(day, RunTitle, $"{run}. Open Taperday for the distance and paces.");
    }

    /// <summary>
    /// A Monday that starts a week after the first, short of race week: the weeks the coach makes a call on, so the
    /// note has something new to say.
    /// </summary>
    private static bool OpensAWeek(TrainingPlan plan, DateOnly day) =>
        day.DayOfWeek == DayOfWeek.Monday
        && plan.Weeks.Any(w => w.StartDate == day && w.Phase != TrainingPhase.RaceWeek)
        && plan.Weeks.Any(w => w.StartDate < day);
}
