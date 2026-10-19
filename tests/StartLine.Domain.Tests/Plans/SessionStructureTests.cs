using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>Every session says, in a form a run can be judged against, how much of it is the real work.</summary>
public sealed class SessionStructureTests
{
    private static readonly DayOfWeek[] FiveDays =
        [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    public static TheoryData<double, int> Races => new()
    {
        { 5, 25 },
        { 10, 50 },
        { 21.0975, 110 },
        { 42.195, 240 },
        { 56, 360 },
        { 90, 660 },
    };

    private static List<PlannedSession> Sessions(double km, int goalMinutes) =>
    [
        .. TrainingPlanGenerator.Generate(new PlanParameters(
                Distance.FromKilometres(km), TimeSpan.FromMinutes(goalMinutes), new DateOnly(2027, 6, 13), new DateOnly(2026, 10, 8),
                FiveDays, DayOfWeek.Sunday, 40))
            .Weeks.SelectMany(w => w.Sessions),
    ];

    [Theory]
    [MemberData(nameof(Races))]
    public void The_work_in_a_structured_session_fits_inside_it(double km, int goalMinutes)
    {
        var structured = Sessions(km, goalMinutes).Where(s => s.Shape.Shape is WorkShape.Continuous or WorkShape.Reps).ToList();

        structured.ShouldNotBeEmpty();
        structured.ShouldAllBe(s => s.Shape.WorkKm > 0 && s.Shape.WorkKm < s.DistanceKm && s.Shape.WorkZone != null);
    }

    [Theory]
    [MemberData(nameof(Races))]
    public void Easy_and_long_runs_and_the_race_are_one_steady_effort(double km, int goalMinutes)
    {
        var steadyTypes = new[] { SessionType.Easy, SessionType.Recovery, SessionType.LongRun, SessionType.MediumLongRun, SessionType.Shakeout, SessionType.Race };

        Sessions(km, goalMinutes).Where(s => steadyTypes.Contains(s.Type)).ShouldAllBe(s => s.Shape.Shape == WorkShape.Steady);
    }

    [Theory]
    [MemberData(nameof(Races))]
    public void Hills_and_fartlek_are_run_by_effort_and_intervals_are_reps(double km, int goalMinutes)
    {
        var sessions = Sessions(km, goalMinutes);

        sessions.Where(s => s.Type is SessionType.Hills or SessionType.Fartlek).ShouldAllBe(s => s.Shape.Shape == WorkShape.ByEffort);
        sessions.Where(s => s.Type is SessionType.Intervals or SessionType.CruiseIntervals)
            .ShouldAllBe(s => s.Shape.Shape == WorkShape.Reps && s.Shape.RepMetres >= 400);
    }

    [Fact]
    public void A_fast_finish_long_run_works_at_race_pace_at_the_end()
    {
        var fastFinish = Sessions(42.195, 240).First(s => s.Type == SessionType.LongRunFastFinish);

        fastFinish.Shape.ShouldBe(SessionStructure.Continuous(fastFinish.Shape.WorkKm, PaceZone.Race));
        fastFinish.Shape.WorkKm.ShouldBeInRange(2, 8);
    }
}
