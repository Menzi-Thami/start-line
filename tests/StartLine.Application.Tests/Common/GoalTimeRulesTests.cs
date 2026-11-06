using System.Globalization;
using StartLine.Application.Common;

namespace StartLine.Application.Tests.Common;

public sealed class GoalTimeRulesTests
{
    [Theory]
    [InlineData(5, 755.36)]
    [InlineData(10, 1571)]
    [InlineData(21.0975, 3450)]
    [InlineData(42.195, 7235)]
    [InlineData(100, 21935)]
    public void World_record_times_match_the_records_at_their_own_distances(double km, double seconds) =>
        Assert.Equal(seconds, GoalTimeRules.WorldRecordSeconds(km), precision: 1);

    [Fact]
    public void World_record_time_rises_with_distance_in_between_and_beyond_the_records()
    {
        var distances = new[] { 0.8, 1.609344, 2, 4, 7.5, 15, 30, 42.2, 56, 89, 160 };
        var times = distances.Select(GoalTimeRules.WorldRecordSeconds).ToArray();
        for (var i = 1; i < times.Length; i++)
        {
            Assert.True(times[i] > times[i - 1], $"{distances[i]} km should take longer than {distances[i - 1]} km");
        }
    }

    [Theory]
    [InlineData(5, "00:00:30")] // the user's example: a 5K in 30 seconds
    [InlineData(5, "00:12:00")] // faster than 12:35
    [InlineData(42.195, "01:50:00")] // faster than 2:00:35, which the old 150 s/km floor let through
    [InlineData(42.195, "02:00:00")]
    [InlineData(21.0975, "00:55:00")]
    [InlineData(56, "02:59:00")] // Two Oceans: below the interpolated record pace
    [InlineData(5, "21:00:00")] // slower than walking
    public void Rejects_times_faster_than_the_world_record_or_slower_than_walking(double km, string time) =>
        Assert.False(GoalTimeRules.IsPlausible(km, TimeSpan.Parse(time, CultureInfo.InvariantCulture)));

    [Theory]
    [InlineData(5, "00:12:40")]
    [InlineData(5, "00:28:00")]
    [InlineData(42.195, "02:00:40")]
    [InlineData(42.195, "05:30:00")]
    [InlineData(21.0975, "02:00:00")]
    [InlineData(56, "06:30:00")]
    [InlineData(89, "11:30:00")]
    public void Accepts_any_time_a_person_could_really_run(double km, string time) =>
        Assert.True(GoalTimeRules.IsPlausible(km, TimeSpan.Parse(time, CultureInfo.InvariantCulture)));
}
