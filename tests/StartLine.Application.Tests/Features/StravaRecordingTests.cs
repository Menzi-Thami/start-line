using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Features.Sync;
using StartLine.Domain.Activities;
using StartLine.Domain.Sync;

namespace StartLine.Application.Tests.Features;

public sealed class StravaRecordingTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 18, 4, 30, 0, TimeSpan.Zero);

    private static StravaActivity Activity(string sportType = "Run", bool trainer = false, bool manual = false, string? device = "Garmin Forerunner 265") =>
        new(77, 5, sportType, Start, trainer, manual, 42, 151.4, 172.6, 410.2, device);

    /// <summary>A steady run sampled every second: <paramref name="seconds"/> long at <paramref name="metresPerSecond"/>.</summary>
    private static StravaStreams Streams(int seconds = 1500, double metresPerSecond = 3.33, bool heartRate = true, bool altitude = true) => new(
        [.. Enumerable.Range(0, seconds + 1)],
        [.. Enumerable.Range(0, seconds + 1).Select(t => t * metresPerSecond)],
        altitude ? [.. Enumerable.Range(0, seconds + 1).Select(t => 100 + (t / 100.0))] : null,
        heartRate ? [.. Enumerable.Range(0, seconds + 1).Select(_ => 150)] : null);

    [Theory]
    [InlineData("Run", false, ActivityKind.Run)]
    [InlineData("Run", true, ActivityKind.TreadmillRun)]
    [InlineData("TrailRun", false, ActivityKind.TrailRun)]
    [InlineData("VirtualRun", false, ActivityKind.TreadmillRun)]
    [InlineData("Ride", false, ActivityKind.Other)]
    [InlineData("Walk", false, ActivityKind.Other)]
    public void Strava_run_types_map_to_taperday_kinds(string sportType, bool trainer, ActivityKind expected) =>
        StravaRecording.KindOf(sportType, trainer).ShouldBe(expected);

    [Fact]
    public void Streams_become_the_same_samples_a_fit_upload_gives()
    {
        var recording = StravaRecording.From(Activity(), Streams())!;

        recording.StartedAt.ShouldBe(Start);
        recording.Kind.ShouldBe(ActivityKind.Run);
        recording.Samples.Count.ShouldBe(1501);
        recording.Samples[600].ShouldBe(new ActivitySample(TimeSpan.FromSeconds(600), 600 * 3.33, 106, 150));
        recording.Device.ShouldBe(new DeviceTotals(42, 410, 151, 173));
    }

    [Fact]
    public void A_synced_run_gets_the_same_analysis_as_an_upload()
    {
        var recording = StravaRecording.From(Activity(), Streams(seconds: 1502))!;

        var run = Domain.Activities.Activity.Record(Guid.NewGuid(), recording, DateOnly.FromDateTime(Start.UtcDateTime), [], ActivityOrigin.Strava(77, Start, true));

        run.DistanceKm.ShouldBe(5, tolerance: 0.01);
        run.Splits.Count.ShouldBe(5);
        run.BestEfforts.ShouldContain(e => e.DistanceMetres == 5000);
        run.AverageHeartRate.ShouldBe(151);
    }

    [Fact]
    public void Missing_heart_rate_or_altitude_just_leaves_them_out()
    {
        var recording = StravaRecording.From(Activity(), Streams(heartRate: false, altitude: false))!;

        recording.Samples.ShouldAllBe(s => s.HeartRate == null && s.AltitudeMetres == null);
    }

    [Fact]
    public void A_stream_that_does_not_line_up_with_time_is_ignored_rather_than_misread()
    {
        var streams = Streams() with { HeartRate = [150, 151] };

        StravaRecording.From(Activity(), streams)!.Samples.ShouldAllBe(s => s.HeartRate == null);
    }

    [Fact]
    public void Rides_manual_entries_and_runs_without_streams_are_skipped()
    {
        StravaRecording.From(Activity("Ride"), Streams()).ShouldBeNull();
        StravaRecording.From(Activity(manual: true), Streams()).ShouldBeNull();
        StravaRecording.From(Activity(), null).ShouldBeNull();
        StravaRecording.From(Activity(), Streams() with { Distance = [0, 1] }).ShouldBeNull();
    }

    [Theory]
    [InlineData("Garmin Forerunner 265", true)]
    [InlineData("garmin fenix 8", true)]
    [InlineData("COROS PACE 3", false)]
    [InlineData(null, false)]
    public void Garmin_devices_are_credited(string? device, bool expected) =>
        StravaRecording.RecordedOnGarmin(Activity(device: device)).ShouldBe(expected);
}

public sealed class StravaRateGateTests
{
    [Fact]
    public void The_gate_closes_at_90_percent_and_reopens_on_the_quarter_hour()
    {
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 10, 19, 6, 7, 0, TimeSpan.Zero));
        var gate = new StravaRateGate(time);

        gate.Record(new ApiUsage(50, 100, 50, 1000));
        gate.BlockedUntil().ShouldBeNull();

        gate.Record(new ApiUsage(90, 100, 140, 1000));
        gate.BlockedUntil().ShouldBe(new DateTimeOffset(2026, 10, 19, 6, 15, 0, TimeSpan.Zero));

        time.Advance(TimeSpan.FromMinutes(8));
        gate.BlockedUntil().ShouldBeNull();
    }

    [Fact]
    public void A_429_waits_for_midnight_when_the_daily_figure_is_spent()
    {
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 10, 19, 6, 7, 0, TimeSpan.Zero));
        var gate = new StravaRateGate(time);
        gate.Record(new ApiUsage(10, 100, 1000, 1000));

        gate.RecordRejected().ShouldBe(new DateTimeOffset(2026, 10, 20, 0, 0, 0, TimeSpan.Zero));
    }
}
