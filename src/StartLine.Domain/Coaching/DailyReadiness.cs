using StartLine.Domain.Common;

namespace StartLine.Domain.Coaching;

public enum Feeling { Fresh, Okay, Tired, Unwell }

public enum SleepQuality { Good, Okay, Poor }

public enum Soreness { None, Some, Heavy }

/// <summary>
/// How the runner said they felt on one day: optional, one per day, theirs to change or clear. It's how they feel, not a
/// diagnosis, and Taperday never treats it as one. The weekly review reads it as the readiness answer the runner would
/// otherwise give there (<see cref="ReadinessFor"/>), and a change still needs their approval.
/// </summary>
public sealed class DailyReadiness
{
    public const int MaxNoteLength = 280;

    /// <summary>How far back a day can still be logged or changed.</summary>
    public const int EditableDays = 14;

    private DailyReadiness()
    {
    }

    public Guid Id { get; private set; }

    public Guid RunnerId { get; private set; }

    public DateOnly Date { get; private set; }

    public Feeling Feeling { get; private set; }

    public SleepQuality? Sleep { get; private set; }

    public Soreness? Soreness { get; private set; }

    public string? Note { get; private set; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public static DailyReadiness Log(Guid runnerId, DateOnly date, DateOnly today, Feeling feeling, SleepQuality? sleep, Soreness? soreness, string? note, DateTimeOffset at)
    {
        var readiness = new DailyReadiness { Id = Guid.NewGuid(), RunnerId = runnerId, Date = date };
        readiness.Change(today, feeling, sleep, soreness, note, at);
        return readiness;
    }

    public void Change(DateOnly today, Feeling feeling, SleepQuality? sleep, Soreness? soreness, string? note, DateTimeOffset at)
    {
        if (!CanLog(Date, today))
        {
            throw new DomainException($"Log how you felt today or on one of the last {EditableDays - 1} days.");
        }

        if (!Enum.IsDefined(feeling) || sleep is { } s && !Enum.IsDefined(s) || soreness is { } r && !Enum.IsDefined(r))
        {
            throw new DomainException("Choose how you feel from the options given.");
        }

        var trimmed = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        if (trimmed is { Length: > MaxNoteLength })
        {
            throw new DomainException($"Keep the note to {MaxNoteLength} characters.");
        }

        Feeling = feeling;
        Sleep = sleep;
        Soreness = soreness;
        Note = trimmed;
        UpdatedAt = at;
    }

    public static bool CanLog(DateOnly date, DateOnly today) => date <= today && date > today.AddDays(-EditableDays);

    /// <summary>
    /// The readiness answer a check-in gives the weekly review. Cautious by design: only "fresh" counts as ready to
    /// progress, "okay" says nothing, and tired or unwell hold the week back.
    /// </summary>
    public static RecoveryReadiness ReadinessFor(Feeling feeling) => feeling switch
    {
        Feeling.Fresh => RecoveryReadiness.Ready,
        Feeling.Tired => RecoveryReadiness.Tired,
        Feeling.Unwell => RecoveryReadiness.Unwell,
        _ => RecoveryReadiness.NotReported,
    };
}
