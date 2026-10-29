using StartLine.Domain.Coaching;

namespace StartLine.Application.Features.Notifications;

/// <summary>
/// The coach's call in a sentence or two, for a Monday reminder. The same words as the coach's note in the app
/// (<c>client/src/features/coaching/CoachNote.tsx</c>): change one, change both.
/// </summary>
internal static class CoachWords
{
    public static string Of(CoachDecision call)
    {
        ArgumentNullException.ThrowIfNull(call);
        var title = call.Verdict switch
        {
            CoachVerdict.NotEnoughToGoOn => "Tell me how your runs go.",
            CoachVerdict.Struggling => "An easier week.",
            CoachVerdict.Hurting => "Look after that first.",
            CoachVerdict.Thriving => "Strong week.",
            _ => "On track.",
        };
        var why = call.Reasons.Count > 0 ? Why(call.Reasons[0]) : null;
        var change = Change(call);
        return string.Join(" ", new[] { title, why, change }.Where(part => part is not null));
    }

    private static string Why(CoachReason reason) => reason switch
    {
        CoachReason.FewCheckIns => "Check in after your runs, or let your watch send them, and I’ll fit each week to how you’re going.",
        CoachReason.RanAsPlanned => "Last week went to plan.",
        CoachReason.FeltHarderThanPlanned => "Several runs last week felt harder than they should.",
        CoachReason.MissedVolume => "Last week came in well short of the plan.",
        CoachReason.HighHeartRateDrift => "Your heart rate drifted up on easy runs, a sign of tiredness.",
        CoachReason.Niggles => "Something niggled on more than one run.",
        CoachReason.Pain => "Something hurt enough to change how you ran.",
        CoachReason.FeltEasierThanPlanned => "Your hard sessions felt easier than they should.",
        CoachReason.FasterThanPlanned => "You ran your hard sessions faster than planned.",
        CoachReason.StrugglingTwice => "That’s two tough weeks in a row, so the easier week comes now.",
        CoachReason.ThrivingTwice => "That’s two strong weeks in a row.",
        CoachReason.BuildingConsistency => "Keep building consistency. Progression needs three strong weeks, complete logs and a positive recovery check.",
        CoachReason.RecoveryFatigue => "You reported that you still feel tired, so recovery comes first.",
        CoachReason.RecoveryIllness => "You reported feeling unwell or not ready to train. Rest and use the illness replan when ready.",
        CoachReason.RecoveryWeek => "This is a recovery or taper week. Feeling good is a reason to respect it.",
        CoachReason.OneDemandAtATime => "Only one demand increases: distance, workout difficulty or pace.",
        _ => "You rebuilt your plan last week, so this week follows it as it is.",
    };

    private static string? Change(CoachDecision call) => call switch
    {
        { CutbackNow: true } => "This is an easier week: less running and no hard sessions.",
        { HoldVolume: true, DoseStep: < 0 } => "This week stays at last week’s distance, with one smaller hard session instead of two.",
        { HoldVolume: true } => "This week stays at last week’s distance.",
        { DoseStep: > 0 } => "This week’s hard sessions are a step bigger.",
        { Verdict: CoachVerdict.Thriving } => "Keep building consistency; any increase is reviewed with you first.",
        _ => null,
    };
}
