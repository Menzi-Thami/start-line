namespace StartLine.Domain.Plans;

/// <summary>Short, plan-based context shared by the weekly view and weekly reminder.</summary>
public static class WeekGuidance
{
    public static string For(PlanWeek week)
    {
        ArgumentNullException.ThrowIfNull(week);
        if (week.IsCutback) return "This is an easier week to absorb the work so far. Keep the easy sessions comfortable and allow time to recover.";
        if (week.Number == 1 && week.Phase != TrainingPhase.RaceWeek) return "Build a routine you can repeat. Start conservatively and finish easy runs feeling comfortable.";
        return week.Phase switch
        {
            TrainingPhase.Base => "Build comfortable time on your feet. A repeatable routine matters more than chasing speed this week.",
            TrainingPhase.Build => "Each quality session has a purpose. Keep the easy days easy so there is room to recover between them.",
            TrainingPhase.Peak => "This is a demanding part of the block. Protect your recovery and follow the planned effort rather than adding extra work.",
            TrainingPhase.Taper => "Let the training load ease so you can arrive rested. There is no need to make up earlier kilometres.",
            _ => "Keep the remaining work light, use familiar kit and food, and check the race organiser’s final instructions.",
        };
    }
}
