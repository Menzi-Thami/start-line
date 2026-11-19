using System.Globalization;

namespace StartLine.Application.Features.CoachingTips;

/// <summary>One coaching tip: a stable key (kept on the delivery record), a title and two to four short sentences.</summary>
public sealed record CoachingTip(string Key, string Title, string Body);

/// <summary>Which run of weekly tips a runner follows when nothing more pressing applies.</summary>
public enum CoachingTrack
{
    /// <summary>Track A: new runners. A plan for a new runner, a Couch to 5K programme under way, or no current plan.</summary>
    NewRunner,

    /// <summary>Track B: everyone else, working on their times.</summary>
    Improving,
}

/// <summary>
/// Every coaching tip Taperday sends (docs/coaching-tips.md), written from the owner's research: 80/20 easy running and the
/// talk test, the 2025 single-run spike finding, Couch to 5K and run–walk, heavy strength work with plyometrics, IOC 2023
/// REDs and the taper meta-analyses. Plain British English, warm and practical, never a diagnosis. Keys are kept on the
/// delivery record, so a key, once sent, must never be renamed or reused for different advice.
/// </summary>
public static class CoachingTipBank
{
    private static readonly CultureInfo En = CultureInfo.GetCultureInfo("en-GB");

    /// <summary>Race week (the race is 0–6 days after the Thursday): one each race, in turn.</summary>
    public static readonly IReadOnlyList<CoachingTip> RaceWeek =
    [
        new("race-1", "Nothing new on race day",
            "Race day is the day to stick with what you know. Your shoes, breakfast, gels and kit should all be things you've already used on long runs. Save anything new for after the finish."),
        new("race-2", "Start slower than you want",
            "Adrenaline makes the first kilometres feel easy, so it's tempting to go off fast. Hold back early and settle in. Be patient now and you'll be passing people later."),
        new("race-3", "Sleep two nights out",
            "Nerves often spoil the last night before a race, and that's fine. The night before that matters more, so make that one an early night. One restless night won't undo your training."),
    ];

    /// <summary>The taper (the race is 7–20 days away).</summary>
    public static readonly IReadOnlyList<CoachingTip> Taper =
    [
        new("taper-1", "Less running, same sharpness",
            "Over the last two weeks or so, your running drops by roughly half, but the faster bits stay. Restless or heavy legs are normal while you taper. The fitness is banked."),
        new("taper-2", "Don't test yourself",
            "It's tempting to run one hard session to check your fitness. Resist it. Extra effort now is tiredness you carry to the start line."),
    ];

    /// <summary>The long-run jump, as it reads without a runner's numbers (see <see cref="LongRunJump"/>).</summary>
    public static readonly CoachingTip Spike = new("spike", "Easy on the long-run jumps",
        "Your longest run this week was more than 10% beyond your longest in the previous month. Big single jumps, more than weekly totals, are what tend to cause overuse injuries. Keep the next one within about 10% of your longest from the month before, and never squeeze missed runs into one long run.");

    /// <summary>A quiet week on the plan.</summary>
    public static readonly CoachingTip Comeback = new("comeback", "Pick up where the plan is",
        "A quiet week costs very little fitness. Don't cram the missed runs into the weekend. Do this week's plan as it's written, and start easy.");

    /// <summary>Track A, one a week in this order.</summary>
    public static readonly IReadOnlyList<CoachingTip> NewRunner =
    [
        new("a-1", "The talk test",
            "Run slowly enough that you could talk in full sentences. If you can't, slow down or walk for a bit. Walk breaks are part of the plan, not a sign you've failed."),
        new("a-2", "Comfort over hype",
            "Pick the running shoe that feels most comfortable on your feet. There's no need for expensive \"corrective\" shoes. If you can, rotating two pairs spreads the load."),
        new("a-3", "The week-three dip",
            "Around now the novelty can fade before the results show. Fitness takes about six weeks to feel, so keep going. Music, a podcast or a friend can make easy runs pass."),
        new("a-4", "Don't catch up",
            "If you miss a run, let it go. Cramming it into the weekend long run is the classic way to get hurt. Keep each run within about 10% of your longest in the past month."),
        WarmUp("a-5"),
        new("a-6", "Your first continuous run",
            "When your plan joins the walk and run sections into one, keep the same relaxed, chatty effort. Slow down as much as you need to. Finishing comfortably is what counts."),
        SoreOrHurt("a-7"),
        new("a-8", "Easy should feel easy",
            "Most of your running should feel easy, even embarrassingly slow. Running every run moderately hard tires you out without making you fitter any faster."),
        new("a-9", "Treadmills and hot days",
            "On a treadmill, set a 1% incline to match running outdoors. On hot or humid days, slow down and run by effort, and skip cotton."),
        new("a-10", "Your first strides",
            "After a few weeks of easy running, try a few strides: relaxed, quicker bursts of 20–30 seconds, with a minute or more of easy running in between. Once or twice a week is plenty."),
        new("a-11", "Your morning heart rate",
            "If your resting heart rate is up for several mornings in a row, take it easy for a few days. It usually means sleep or life stress is catching up with you."),
        new("a-12", "Hold steady before adding more",
            "If running feels good, stay at this level for a few weeks before stepping up. Consistency beats big jumps."),
    ];

    /// <summary>Track B, one a week in this order.</summary>
    public static readonly IReadOnlyList<CoachingTip> Improving =
    [
        new("b-1", "Trust your plan's paces",
            "Your plan's paces come from your goal and your recent races. If you're unsure between two levels, choose the easier one and hold it for about four weeks."),
        new("b-2", "Hill sprints",
            "Once a week, try 4–6 steep uphill sprints of about 8 seconds, with a full 2-minute walk back down after each. Keep them short, relaxed and fast. They build power safely."),
        new("b-3", "Lift heavy-ish",
            "Strength work helps your running most when it's heavy for a few reps, such as squats and deadlifts, plus some hops and bounds. Do it on easy days so your key runs stay fresh."),
        new("b-4", "Don't race the reps",
            "Run your intervals at the plan's pace, not faster. Faster reps tire you out without making you any fitter."),
        Cadence("b-5"),
        Fuel("b-6"),
        new("b-7", "Train your gut",
            "On runs longer than about 75–90 minutes, take a little carbohydrate every 15–20 minutes: a gel, some sweets or a drink. It gets your stomach ready for race day."),
        new("b-8", "Race-specific weeks",
            "In the last couple of months before a half or full marathon, it's right that some long runs include sections at goal pace. The usual rule of keeping most running easy bends a little as the race gets close."),
        new("b-9", "Heat changes the maths",
            "Above about 18°C, especially when it's humid, expect to slow down by a few percent or more. Run by effort, not pace. It takes 10–14 days to adapt to heat."),
        new("b-10", "Rehearse race day",
            "Try your race shoes, kit, breakfast and fuel in a long run or a low-key tune-up race first. Then race day holds no surprises."),
        new("b-11", "Talk yourself through it",
            "In hard sessions, focus on your breathing, posture and rhythm. Practise a short reset phrase, too, for when doubts arrive late in a race."),
        new("b-12", "The taper",
            "In the final two weeks or so, cut your running by roughly half. Keep some faster running and your usual number of runs."),
    ];

    /// <summary>After a track's twelve, these in turn, round and round.</summary>
    public static readonly IReadOnlyList<CoachingTip> Rotation =
    [
        new("g-1", "Plans bend",
            "Heat, hills, poor sleep or a busy week are reasons to run easier, not failures. Your plan works best when it bends to fit your life."),
        new("g-2", "Two pairs of shoes",
            "If you can, rotate two pairs of running shoes: it spreads the load. Choose the ones that feel most comfortable, not the most \"corrective\"."),
        new("g-3", "Easy days build fitness",
            "Easy days are where fitness is built. Keep them truly easy, even embarrassingly slow, so your harder sessions get your best."),
        new("g-4", "The 10% long-run rule",
            "Keep each run within about 10% of your longest in the past month. Big single jumps are what tend to cause overuse injuries. Let a missed run go rather than adding it to the next one."),
        WarmUp("g-5"),
        SoreOrHurt("g-6"),
        Fuel("g-7"),
        Cadence("g-8"),
    ];

    /// <summary>Every tip, for looking one up by the key on a delivery record.</summary>
    public static IEnumerable<CoachingTip> All =>
        [.. RaceWeek, .. Taper, Spike, Comeback, .. NewRunner, .. Improving, .. Rotation];

    /// <summary>A track's twelve tips.</summary>
    public static IReadOnlyList<CoachingTip> For(CoachingTrack track) => track == CoachingTrack.NewRunner ? NewRunner : Improving;

    /// <summary>
    /// The long-run jump in the runner's own numbers: their longest run in the last week, their longest in the month
    /// before, and a suggested cap of 1.1 times the earlier one. Worked out when the email is composed and never kept.
    /// </summary>
    public static CoachingTip LongRunJump(double longestKm, double earlierLongestKm) => Spike with
    {
        Body = $"Your longest run this week ({Km(longestKm)} km) was more than 10% beyond your longest in the previous month ({Km(earlierLongestKm)} km). Big single jumps, more than weekly totals, are what tend to cause overuse injuries. Keep the next one nearer {Km(earlierLongestKm * 1.1)} km, and never squeeze missed runs into one long run.",
    };

    private static string Km(double km) => Math.Round(km, 1).ToString("0.#", En);

    private static CoachingTip WarmUp(string key) => new(key, "Warm up by moving",
        "Start with five minutes of brisk walking or very easy jogging, then some leg swings and walking lunges. Save long, still stretches for after your run.");

    private static CoachingTip SoreOrHurt(string key) => new(key, "Sore or hurt?",
        "Muscle ache a day or two after a run, which fades, is normal. Sharp pain in one spot, pain that gets worse, or pain that changes how you run is different. Rest, and see a physio or sports doctor if it lingers.");

    private static CoachingTip Fuel(string key) => new(key, "Fuel the work",
        "Eat enough, especially carbohydrate, in your bigger weeks. Ongoing tiredness, low mood, poor sleep or stress injuries can mean under-fuelling, in men and women alike. If that sounds familiar, see a sports doctor or dietitian.");

    private static CoachingTip Cadence(string key) => new(key, "Cadence, not foot strike",
        "You don't need to change how your foot lands. If you overstride, take slightly quicker, shorter steps: about 5–10% more steps eases the load on your knees and hips. It feels odd for a few weeks.");
}
