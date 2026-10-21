using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Coaching;

/// <summary>Fitness from recent runs, and the pace nudge without them: one test per rule.</summary>
public sealed class FitnessTests
{
    private static readonly DateOnly Monday = new(2026, 11, 2);

    private static Effort FiveK(int daysAgo, int minutes, int seconds = 0) =>
        new(Monday.AddDays(-daysAgo), 5000, new TimeSpan(0, minutes, seconds));

    [Fact]
    public void Fitness_comes_from_the_best_recent_effort()
    {
        var fitness = Fitness.Estimate(Distance.TenK, Monday, [FiveK(3, 26), FiveK(4, 24)]).ShouldNotBeNull();

        // 24:00 for 5K is about 50:00 for 10K by Riegel.
        fitness.TotalMinutes.ShouldBeInRange(49.5, 50.5);
    }

    [Fact]
    public void Efforts_older_than_six_weeks_dont_count() =>
        Fitness.Estimate(Distance.TenK, Monday, [FiveK(Fitness.WindowDays + 1, 22)]).ShouldBeNull();

    [Fact]
    public void Efforts_shorter_than_3km_dont_count() =>
        Fitness.Estimate(Distance.TenK, Monday, [new Effort(Monday.AddDays(-2), 1609, TimeSpan.FromMinutes(6))]).ShouldBeNull();

    [Fact]
    public void Older_efforts_count_for_a_little_less()
    {
        var recent = Fitness.Estimate(Distance.TenK, Monday, [FiveK(3, 24)]).ShouldNotBeNull();
        var older = Fitness.Estimate(Distance.TenK, Monday, [FiveK(35, 24)]).ShouldNotBeNull();

        older.ShouldBeGreaterThan(recent);
        (older.TotalSeconds / recent.TotalSeconds).ShouldBeInRange(1.01, 1.02);
    }

    private static RunEvidence Hard(SessionType type, int effort) =>
        new(new PlannedSession(Monday.AddDays(-5), type, "", "", "", 9, PaceZone.Tempo), new CheckInAnswers(CheckInStatus.Done, effort));

    [Fact]
    public void Paces_ease_when_every_hard_session_felt_much_harder_than_it_should() =>
        Fitness.PaceFactor(1, [Hard(SessionType.Tempo, 9), Hard(SessionType.Intervals, 10)]).ShouldBe(1.02);

    [Fact]
    public void Paces_quicken_a_little_when_every_hard_session_felt_much_easier() =>
        Fitness.PaceFactor(1, [Hard(SessionType.Tempo, 4), Hard(SessionType.Intervals, 5)]).ShouldBe(0.99);

    [Fact]
    public void A_mixed_week_leaves_the_paces_where_they_were() =>
        Fitness.PaceFactor(1.02, [Hard(SessionType.Tempo, 9), Hard(SessionType.Intervals, 7)]).ShouldBe(1.02);

    [Fact]
    public void The_pace_nudge_has_limits() =>
        Fitness.PaceFactor(Fitness.MaxPaceFactor, [Hard(SessionType.Tempo, 10)]).ShouldBe(Fitness.MaxPaceFactor);

    [Fact]
    public void Without_rated_hard_sessions_the_paces_stay() =>
        Fitness.PaceFactor(1.02, [new RunEvidence(new PlannedSession(Monday, SessionType.Easy, "", "", "", 6, PaceZone.Easy), null)]).ShouldBe(1.02);
}
