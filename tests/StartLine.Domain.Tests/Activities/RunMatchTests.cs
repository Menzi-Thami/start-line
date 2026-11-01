using StartLine.Domain.Activities;
using StartLine.Domain.Common;
using StartLine.Domain.Sync;

namespace StartLine.Domain.Tests.Activities;

public class RunMatchTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 8, 4, 0, 0, TimeSpan.Zero);
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);

    [Theory]
    [InlineData(0, 10_000, 10_000)]
    [InlineData(45, 10_000, 10_150)]
    [InlineData(-110, 10_000, 9_800)]
    [InlineData(30, 3_000, 3_140)]
    public void A_start_within_two_minutes_and_the_same_distance_is_the_same_run(int secondsApart, double first, double second) =>
        RunMatch.Compare(Start, Hour, first, Start.AddSeconds(secondsApart), Hour, second).ShouldBe(RunRelation.SameRun);

    [Fact]
    public void Three_minutes_apart_is_not_the_same_run_even_at_the_same_distance() =>
        RunMatch.IsSameRun(Start, 10_000, Start.AddMinutes(3), 10_000).ShouldBeFalse();

    [Fact]
    public void A_much_shorter_run_inside_a_longer_one_overlaps_but_is_not_the_same() =>
        RunMatch.Compare(Start, Hour, 10_000, Start.AddMinutes(20), TimeSpan.FromMinutes(20), 4_000).ShouldBe(RunRelation.Overlapping);

    [Fact]
    public void Runs_that_dont_overlap_are_unrelated() =>
        RunMatch.Compare(Start, Hour, 10_000, Start.AddHours(2), Hour, 10_000).ShouldBe(RunRelation.Unrelated);

    [Fact]
    public void A_dismissed_pair_is_stored_one_way_round()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var one = DuplicateDismissal.Of(Guid.NewGuid(), a, b, Start);
        var other = DuplicateDismissal.Of(Guid.NewGuid(), b, a, Start);
        (one.FirstActivityId, one.SecondActivityId).ShouldBe((other.FirstActivityId, other.SecondActivityId));
        Should.Throw<DomainException>(() => DuplicateDismissal.Of(Guid.NewGuid(), a, a, Start));
    }

    [Fact]
    public void An_upload_origin_keeps_only_the_file_name_and_cuts_long_ones()
    {
        ActivityOrigin.Uploaded(@"C:\Users\me\runs\easy.fit").FileName.ShouldBe("easy.fit");
        ActivityOrigin.Uploaded("/home/me/runs/tempo.gpx").FileName.ShouldBe("tempo.gpx");
        ActivityOrigin.Uploaded(@"runs\nested/mixed\long.tcx").FileName.ShouldBe("long.tcx");
        ActivityOrigin.Uploaded("plain.fit").FileName.ShouldBe("plain.fit");
        ActivityOrigin.Uploaded("folder/").FileName.ShouldBeNull();
        ActivityOrigin.Uploaded("   ").FileName.ShouldBeNull();
        ActivityOrigin.Uploaded(new string('x', 300) + ".fit").FileName!.Length.ShouldBe(ActivityOrigin.MaxFileNameLength);
    }

    [Fact]
    public void A_skipped_fetch_is_done_with_and_cannot_be_retried_but_a_failed_one_can()
    {
        var skipped = SyncJob.Create(Guid.NewGuid(), SyncProvider.Strava, SyncJobKind.FetchActivity, 7, SyncPriority.Live, Start);
        skipped.Skip("Too short");
        skipped.IsDue(Start.AddDays(1)).ShouldBeFalse();
        Should.Throw<DomainException>(() => skipped.Retry(Start));

        var failed = SyncJob.Create(Guid.NewGuid(), SyncProvider.Strava, SyncJobKind.FetchActivity, 8, SyncPriority.Live, Start);
        for (var i = 0; i <= SyncJob.RetryDelays.Count; i++)
        {
            failed.Fail(Start, "503");
        }

        failed.Failed.ShouldBeTrue();
        failed.Retry(Start.AddHours(1));
        failed.Failed.ShouldBeFalse();
        failed.Attempts.ShouldBe(0);
        failed.IsDue(Start.AddHours(1)).ShouldBeTrue();
    }
}
