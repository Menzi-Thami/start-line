using Shouldly;
using StartLine.Domain.Common;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

public class PrivatePrescriptionTests
{
    private static readonly DateOnly Today = new(2026, 10, 8);
    private static TrainingPlan Baseline() => TrainingPlanGenerator.Generate(new(
        Distance.FromKilometres(10), TimeSpan.FromMinutes(60), new(2026, 11, 7), Today,
        [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 25, GeneratorVersion: 3, StartOn: Today));
    private static PrivateStep Step(double km, StepKind kind = StepKind.Run) => new(kind, km, null, PaceZone.Easy, 360, 420, null, 1, []);
    private static PrivatePrescription Valid(TrainingPlan plan)
    {
        List<PrivateSession> sessions = [];
        foreach (var week in plan.Weeks)
        {
            foreach (var offset in new[] { 0, 1, 3, 4 })
            {
                var date = week.StartDate.AddDays(offset);
                if (date < Today || date >= plan.RaceDate || week.Phase == TrainingPhase.RaceWeek) continue;
                sessions.Add(new(Guid.NewGuid(), date, SessionType.Strength, "Synthetic gym", 4, null, [], Gym: offset is 0 or 4 ? GymClass.Lower : GymClass.Upper, DurationMinutes: 40, ReducedLoad: true));
            }
            foreach (var offset in new[] { 1, 3, 6 })
            {
                var date = week.StartDate.AddDays(offset);
                if (date < Today || date >= plan.RaceDate) continue;
                sessions.Add(new(Guid.NewGuid(), date, offset == 6 ? SessionType.LongRun : SessionType.Easy,
                    "Synthetic run", 4, PaceZone.Easy, [Step(week.Phase == TrainingPhase.RaceWeek ? 2 : 6)]));
            }
        }
        sessions.Add(new(Guid.NewGuid(), plan.RaceDate, SessionType.Race, "Synthetic race", 8, PaceZone.Race, [Step(10)]));
        return new(1, sessions, [.. Enum.GetValues<PaceZone>().Select(z => new PrivatePace(z, 360, 420))]);
    }

    [Fact]
    public void Exact_prescription_replaces_baseline_with_four_gym_days_full_rest_and_saturday_race()
    {
        var baseline = Baseline(); var prescription = Valid(baseline);
        prescription.Validate(baseline, Today);
        var plan = prescription.Apply(baseline);
        plan.Weeks.Skip(1).First().Sessions.Count(s => s.Type == SessionType.Strength).ShouldBe(4);
        plan.Weeks.SelectMany(w => w.Sessions).Any(s => s.Date.DayOfWeek == DayOfWeek.Wednesday).ShouldBeFalse();
        plan.Weeks.SelectMany(w => w.Sessions).Single(s => s.Type == SessionType.Race).Date.DayOfWeek.ShouldBe(DayOfWeek.Saturday);
        plan.Weeks.SelectMany(w => w.Sessions).Any(s => s.Date.DayOfWeek == DayOfWeek.Sunday && s.Type == SessionType.LongRun).ShouldBeTrue();
        plan.Weeks.Sum(w => w.PlannedKm).ShouldBe(Math.Round(prescription.Sessions.Sum(s => s.DistanceKm), 1));
        plan.Weeks.SelectMany(w => w.Sessions).Count().ShouldBe(prescription.Sessions.Count);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-1)]
    public void Nonfinite_and_negative_steps_are_rejected(double km)
    {
        var baseline = Baseline(); var valid = Valid(baseline);
        var session = valid.Sessions.First(s => s.Type != SessionType.Strength);
        var invalid = valid with { Sessions = [.. valid.Sessions.Where(s => s.Id != session.Id), session with { Steps = [Step(km)] }] };
        Should.Throw<DomainException>(() => invalid.Validate(baseline, Today));
    }

    [Fact]
    public void Complete_distance_includes_warmup_repeat_recovery_and_cooldown()
    {
        var repeat = new PrivateStep(StepKind.Repeat, null, null, null, null, null, null, 4, [Step(0.4), Step(0.2, StepKind.Recover)]);
        var session = new PrivateSession(Guid.NewGuid(), Today, SessionType.Intervals, "Synthetic intervals", 7, PaceZone.Interval,
            [Step(2, StepKind.WarmUp), repeat, Step(1, StepKind.CoolDown)]);
        session.DistanceKm.ShouldBe(5.4);
        session.ToPlanned().Steps!.Count.ShouldBe(3);
        var timed = new PrivateStep(StepKind.Recover, null, 390, PaceZone.Recovery, 360, 420, "Easy jog", 1, []);
        timed.Kilometres.ShouldBe(1);
    }

    [Fact]
    public void Duplicate_id_same_day_run_race_boundary_and_heavy_lower_taper_are_rejected()
    {
        var baseline = Baseline(); var valid = Valid(baseline);
        var first = valid.Sessions.First(s => s.Type != SessionType.Strength);
        foreach (var invalid in new[] {
            valid with { Sessions = [.. valid.Sessions, first] },
            valid with { Sessions = [.. valid.Sessions, first with { Id = Guid.NewGuid() }] },
            valid with { Sessions = [.. valid.Sessions, first with { Id = Guid.NewGuid(), Date = baseline.RaceDate.AddDays(1) }] },
            valid with { Sessions = [.. valid.Sessions, new(Guid.NewGuid(), baseline.RaceDate.AddDays(-2), SessionType.Strength, "Heavy lower", 8, null, [], Gym: GymClass.Lower, DurationMinutes: 45)] },
        }) Should.Throw<DomainException>(() => invalid.Validate(baseline, Today));
    }

    [Fact]
    public void Session_text_gives_paces_as_minutes_per_kilometre()
    {
        static PrivateStep Leaf(StepKind kind, double? km, double? seconds, double fast, double slow, string? effort = null) =>
            new(kind, km, seconds, PaceZone.Tempo, fast, slow, effort, 1, []);
        var session = new PrivateSession(Guid.NewGuid(), Today, SessionType.CruiseIntervals, "Threshold", 7, PaceZone.Tempo,
        [
            Leaf(StepKind.WarmUp, 2, null, 375, 415, "easy"),
            new(StepKind.Repeat, null, null, null, null, null, null, 3, [Leaf(StepKind.Run, null, 360, 300, 315, "controlled"), Leaf(StepKind.Recover, null, 90, 375, 415)]),
            Leaf(StepKind.CoolDown, 3.576, null, 375, 415),
        ]);

        var detail = session.ToPlanned().Detail;

        detail.ShouldBe("Target effort 7/10. Warm up 2 km at 6:15–6:55/km (easy); Repeat 3 times: Run 6 min at 5:00–5:15/km (controlled), then Recover 1 min 30 s at 6:15–6:55/km; Cool down 3.576 km at 6:15–6:55/km.");
        detail.ShouldNotContain("seconds");
    }

    [Fact]
    public void Public_generator_still_caps_strength_at_three()
    {
        Should.Throw<DomainException>(() => TrainingPlanGenerator.Generate(new(Distance.FromKilometres(10), TimeSpan.FromMinutes(60), new(2026, 11, 7), Today,
            [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday], DayOfWeek.Sunday, 25,
            StrengthDays: [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Friday])));
    }
}
