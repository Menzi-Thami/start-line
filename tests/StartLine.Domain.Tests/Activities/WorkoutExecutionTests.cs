using StartLine.Domain.Activities;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Activities;

public sealed class WorkoutExecutionTests
{
    private static readonly PaceRange Target = new(Pace.FromSecondsPerKilometre(290), Pace.FromSecondsPerKilometre(310));

    private static List<ActivitySample> Stream(params (int Seconds, double Pace)[] blocks)
    {
        var samples = new List<ActivitySample> { new(TimeSpan.Zero, 0) };
        var seconds = 0;
        var metres = 0d;
        foreach (var block in blocks)
        {
            for (var i = 0; i < block.Seconds; i++)
            {
                seconds++;
                metres += block.Pace > 0 ? 1000 / block.Pace : 0;
                samples.Add(new ActivitySample(TimeSpan.FromSeconds(seconds), metres));
            }
        }

        return samples;
    }

    [Fact]
    public void Full_distance_does_not_turn_badly_paced_repeats_into_successful_intervals()
    {
        var steps = new[] { new SessionStep(StepKind.WarmUp, DistanceKm: 1),
            new SessionStep(StepKind.Repeat, Times: 2, Block: new SessionSteps([
                new(StepKind.Run, DistanceKm: 1, Pace: Target), new(StepKind.Recover, Duration: TimeSpan.FromSeconds(60))])),
            new SessionStep(StepKind.CoolDown, DistanceKm: 1) };
        var result = WorkoutExecution.Assess(Stream((300, 300), (600, 600), (60, 600), (600, 600), (60, 600), (300, 300)), steps)!;
        result.Stages.Count.ShouldBe(6);
        result.Stages[1].Coverage.ShouldBe(1, .001);
        result.Stages[1].InTargetShare.ShouldBe(0);
        result.Stages[3].InTargetShare.ShouldBe(0);
    }

    [Fact]
    public void Short_recording_reports_partial_work_and_unreached_cooldown()
    {
        var result = WorkoutExecution.Assess(Stream((450, 300)), [
            new(StepKind.WarmUp, DistanceKm: 1), new(StepKind.Run, DistanceKm: 2), new(StepKind.CoolDown, DistanceKm: 1)])!;
        result.Stages[0].Coverage.ShouldBe(1, .001);
        result.Stages[1].Coverage.ShouldBe(.25, .001);
        result.Stages[2].Coverage.ShouldBe(0);
        result.Stages[2].PaceSecondsPerKm.ShouldBeNull();
    }

    [Fact]
    public void Stationary_pauses_do_not_count_as_work_but_stationary_timed_recovery_is_observable()
    {
        var result = WorkoutExecution.Assess(Stream((60, 300), (30, 0), (60, 300), (60, 0), (60, 300)), [
            new(StepKind.Run, Duration: TimeSpan.FromSeconds(120), Pace: Target),
            new(StepKind.Recover, Duration: TimeSpan.FromSeconds(60)), new(StepKind.Run, Duration: TimeSpan.FromSeconds(60), Pace: Target)])!;
        result.Stages[0].MovingSeconds.ShouldBe(120, .1);
        result.Stages[0].ElapsedSeconds.ShouldBe(150, .1);
        result.Stages[1].MovingSeconds.ShouldBe(0, .1);
        result.Stages[1].Coverage.ShouldBe(1, .001);
        result.Stages[2].Coverage.ShouldBe(1, .001);
    }

    [Fact]
    public void Sparse_or_implausible_samples_cannot_provide_stage_evidence()
    {
        WorkoutExecution.Assess([new(TimeSpan.Zero, 0), new(TimeSpan.FromSeconds(60), 200), new(TimeSpan.FromSeconds(120), 400)],
            [new(StepKind.Run, DistanceKm: 1)]).ShouldBeNull();
        WorkoutExecution.Assess([new(TimeSpan.Zero, 0), new(TimeSpan.FromSeconds(1), 200), new(TimeSpan.FromSeconds(2), 400)],
            [new(StepKind.Run, DistanceKm: 1)]).ShouldBeNull();
    }

    [Fact]
    public void Small_distance_noise_does_not_invent_negative_progress()
    {
        var samples = Stream((120, 300));
        samples[30] = samples[30] with { DistanceMetres = samples[29].DistanceMetres - 1 };
        var result = WorkoutExecution.Assess(samples, [new(StepKind.Run, Duration: TimeSpan.FromSeconds(60))])!;
        result.Stages[0].RecordedMetres.ShouldBeGreaterThan(0);
        result.Stages[0].Coverage.ShouldBe(1, .001);
    }

    [Fact]
    public void Excessive_repeat_nesting_is_unavailable_instead_of_unbounded_work()
    {
        WorkoutExecution.Assess(Stream((60, 300)), [new(StepKind.Repeat, Times: 1000,
            Block: new SessionSteps([new(StepKind.Run, Duration: TimeSpan.FromSeconds(1))]))]).ShouldBeNull();
    }
    [Fact]
    public void Ambiguous_prescriptions_do_not_receive_an_execution_assessment()
    {
        var planned = new PlannedSessionMatch("Plan", SessionType.Easy, "Easy", 1, 290, 310)
        {
            Steps = [new(StepKind.Run, DistanceKm: 1, Pace: Target)],
        };
        new RunBuilder().Run(1000, 300).Record(planned).WorkoutExecution.ShouldNotBeNull();
        new RunBuilder().Run(1000, 300).Record(planned, planned with { Title = "Another workout" }).WorkoutExecution.ShouldBeNull();
    }

    [Fact]
    public void Refresh_replaces_evidence_and_does_not_extend_its_lifetime_separately()
    {
        var owner = Guid.NewGuid();
        var fetched = new DateTimeOffset(2026, 11, 4, 12, 0, 0, TimeSpan.Zero);
        var recording = new ActivityRecording(fetched, ActivityKind.Run, Stream((120, 300)), DeviceTotals.None);
        var planned = new PlannedSessionMatch("Plan", SessionType.Easy, "Easy", 1, 290, 310)
        {
            Steps = [new(StepKind.Run, Duration: TimeSpan.FromSeconds(60))],
        };
        var run = Activity.Record(owner, recording, new DateOnly(2026, 11, 4), [planned], ActivityOrigin.Strava(42, fetched, false));
        run.WorkoutExecution.ShouldNotBeNull();
        run.CachedUntil.ShouldBe(fetched + StravaCache.Lifetime);
        var fresh = Activity.Record(owner, recording, new DateOnly(2026, 11, 4), [], ActivityOrigin.Strava(42, fetched.AddDays(1), false));
        run.RefreshFrom(fresh);
        run.WorkoutExecution.ShouldBeNull();
        run.CachedUntil.ShouldBe(fetched.AddDays(1) + StravaCache.Lifetime);
    }

    [Fact]
    public void Missing_start_of_recording_is_not_assumed_to_be_the_warmup()
    {
        WorkoutExecution.Assess(Stream((120, 300)).Skip(30).ToArray(),
            [new(StepKind.WarmUp, Duration: TimeSpan.FromSeconds(60))]).ShouldBeNull();
    }

}
