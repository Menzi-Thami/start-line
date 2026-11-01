using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Coaching;

public sealed class ProgressStoryTests
{
    // A Sunday, so windows end on whole weeks.
    private static readonly DateOnly Today = new(2026, 11, 1);

    private static LoggedRun Logged(int daysAgo, double km, LoggedRunSource source = LoggedRunSource.Uploaded) => new(Today.AddDays(-daysAgo), km, source);

    private static ProgressRun Run(int daysAgo, double km, params BestEffort[] efforts) =>
        new(new TrendRun(Guid.NewGuid(), Today.AddDays(-daysAgo), km, TimeSpan.FromMinutes(km * 6), null, ActivitySource.Upload, SessionType.Easy), efforts);

    private static TrainingPlan Plan(TimeSpan goal) => new(Distance.FromKilometres(10), DistanceCategory.TenK, new DateOnly(2026, 12, 20), goal,
        new DateOnly(2026, 9, 7), new Dictionary<PaceZone, PaceRange>(), [], []);

    [Fact]
    public void Four_weeks_compare_with_the_four_before_on_distance_runs_and_the_longest_run()
    {
        // 20 km a week for 8 weeks, with the long run growing from 8 km to 12 km in the last four.
        List<LoggedRun> logged = [];
        for (var week = 0; week < 8; week++)
        {
            var recent = week < 4;
            logged.AddRange([Logged(7 * week + 1, recent ? 12 : 8), Logged(7 * week + 3, recent ? 8 : 12)]);
        }

        logged.Add(Logged(2, 6));
        var story = ProgressStory.Of(Today, 4, logged, [], [], [], null);
        story.WeekRows.Count.ShouldBe(4);
        story.WeekRows[^1].IsCurrent.ShouldBeTrue();
        story.Current.Km.ShouldBe(86);
        story.Previous.Km.ShouldBe(80);
        story.Current.AverageWeeklyKm.ShouldBe(21.5);
        story.Current.LongestKm.ShouldBe(12);
        story.Current.WeeksRun.ShouldBe(4);
        story.Gaps.ShouldContain(ProgressGap.NoPlan);
        story.Gaps.ShouldNotContain(ProgressGap.NoBaseline);
    }

    [Fact]
    public void A_best_in_the_window_is_new_only_when_it_beats_everything_before()
    {
        List<ProgressRun> runs =
        [
            Run(60, 10, new BestEffort(5000, TimeSpan.FromMinutes(25))),
            Run(5, 10, new BestEffort(5000, TimeSpan.FromMinutes(24)), new BestEffort(10_000, TimeSpan.FromMinutes(51))),
            Run(10, 5, new BestEffort(5000, TimeSpan.FromMinutes(26))),
        ];
        var bests = ProgressStory.Of(Today, 4, [Logged(5, 10), Logged(10, 5)], [], [], runs, null).Bests;
        var fiveK = bests.Single(b => b.Name == "5K");
        fiveK.Time.ShouldBe(TimeSpan.FromMinutes(24));
        fiveK.Before.ShouldBe(TimeSpan.FromMinutes(25));
        fiveK.IsNew.ShouldBeTrue();
        // The first 10K Taperday has seen counts as a first, with nothing before it.
        bests.Single(b => b.Name == "10K").ShouldSatisfyAllConditions(b => b.Before.ShouldBeNull(), b => b.IsNew.ShouldBeTrue());
    }

    [Fact]
    public void The_race_estimate_follows_uploaded_efforts_week_by_week_against_the_goal()
    {
        List<ProgressRun> runs =
        [
            Run(25, 10, new BestEffort(5000, TimeSpan.FromMinutes(26))),
            Run(4, 10, new BestEffort(5000, TimeSpan.FromMinutes(24.5))),
        ];
        var goal = ProgressStory.Of(Today, 4, [Logged(25, 10), Logged(4, 10)], [], [], runs, Plan(TimeSpan.FromMinutes(50))).RaceGoal.ShouldNotBeNull();
        goal.Goal.ShouldBe(TimeSpan.FromMinutes(50));
        goal.Estimates.Count.ShouldBe(4);
        goal.First.ShouldNotBeNull();
        goal.Latest.ShouldNotBeNull();
        goal.Latest!.Value.ShouldBeLessThan(goal.First!.Value);
    }

    [Fact]
    public void Strava_runs_never_make_a_race_estimate_and_their_window_is_flagged()
    {
        var strava = new ProgressRun(new TrendRun(Guid.NewGuid(), Today.AddDays(-2), 10, TimeSpan.FromMinutes(60), null, ActivitySource.Strava, null),
            [new BestEffort(5000, TimeSpan.FromMinutes(22))]);
        var story = ProgressStory.Of(Today, 4, [Logged(2, 10, LoggedRunSource.Strava)], [], [], [strava], Plan(TimeSpan.FromMinutes(50)));
        story.RaceGoal!.Latest.ShouldBeNull();
        story.Gaps.ShouldContain(ProgressGap.StravaWindow);
        story.Gaps.ShouldContain(ProgressGap.NoRaceEstimate);
        story.Gaps.ShouldContain(ProgressGap.NoBaseline);
        story.Gaps.ShouldContain(ProgressGap.FewWeeks);
    }

    [Fact]
    public void Only_four_eight_or_twelve_weeks()
    {
        Should.Throw<DomainException>(() => ProgressStory.Of(Today, 6, [], [], [], [], null));
        ProgressStory.Of(Today, 12, [], [], [], [], null).WeekRows.Count.ShouldBe(12);
    }
}
