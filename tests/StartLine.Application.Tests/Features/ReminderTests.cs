using System.Buffers.Text;
using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Common;
using StartLine.Application.Features.Notifications;
using StartLine.Domain.Notifications;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Application.Tests.Features;

/// <summary>Reminders run on each runner's own clock, and only ever post to a browser's push service.</summary>
public sealed class ReminderTests
{
    // Tuesday 3 November 2026, a run day in the plan below.
    private static readonly DateOnly RunDay = new(2026, 11, 3);

    private static readonly TrainingPlan Plan = new(
        Distance.TenK, DistanceCategory.TenK, new DateOnly(2026, 12, 13), TimeSpan.FromMinutes(50), new DateOnly(2026, 11, 2),
        new Dictionary<PaceZone, PaceRange>(),
        [new PlanWeek(1, new DateOnly(2026, 11, 2), TrainingPhase.Base, false, [new PlannedSession(RunDay, SessionType.Easy, "Easy run", "", "", 6, null)])],
        []);

    private static PushSubscription DeviceAtSeven() =>
        PushSubscription.Start(Guid.NewGuid(), new string('a', PushSubscription.DeviceKeyLength), new ProtectedPushAddress("e", "k", "a"),
            new TimeOnly(7, 0), false, new DateTime(2026, 11, 1, 20, 0, 0));

    [Theory]
    // 05:30 UTC on the run day: 07:30 in Johannesburg (due), 00:30 in New York (not yet), 18:30 in Auckland (late, still
    // due that day) and 18:30 the day before in Honolulu (a rest day there, so nothing).
    [InlineData("Africa/Johannesburg", true)]
    [InlineData("America/New_York", false)]
    [InlineData("Pacific/Auckland", true)]
    [InlineData("Pacific/Honolulu", false)]
    public void The_same_moment_is_a_different_time_of_day_for_each_runner(string zone, bool due)
    {
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 11, 3, 5, 30, 0, TimeSpan.Zero));

        var localNow = time.LocalNow(TimeProviderExtensions.ZoneOf(zone));

        (Reminders.Due(DeviceAtSeven(), Plan, localNow) is not null).ShouldBe(due);
    }

    [Fact]
    public void The_next_reminder_is_seven_in_the_morning_where_the_runner_is()
    {
        var zone = TimeProviderExtensions.ZoneOf("America/New_York");
        var time = new FakeTimeProvider(new DateTimeOffset(2026, 11, 3, 5, 30, 0, TimeSpan.Zero));

        var next = Reminders.NextDue(DeviceAtSeven(), Plan, time.LocalNow(zone))!.Value;

        // 07:00 Eastern Standard Time (UTC-5) is 12:00 UTC.
        TimeProviderExtensions.FromLocal(next, zone).ShouldBe(new DateTimeOffset(2026, 11, 3, 12, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public void A_time_the_clocks_skip_is_taken_an_hour_on()
    {
        // The UK's clocks go from 01:00 to 02:00 on 28 March 2027, so 01:30 never happens; 02:30 BST is 01:30 UTC.
        var zone = TimeProviderExtensions.ZoneOf("Europe/London");

        TimeProviderExtensions.FromLocal(new DateTime(2027, 3, 28, 1, 30, 0), zone)
            .ShouldBe(new DateTimeOffset(2027, 3, 28, 1, 30, 0, TimeSpan.Zero));
    }

    [Fact]
    public void An_unknown_zone_is_taken_as_UTC()
    {
        TimeProviderExtensions.ZoneOf("Not/AZone").ShouldBe(TimeZoneInfo.Utc);
    }

    private sealed class GoogleOnly : IPushSettings
    {
        public bool IsEnabled => true;

        public string? PublicKey => "key";

        public bool Accepts(Uri endpoint) => endpoint.Host == "fcm.googleapis.com";
    }

    private static string Base64UrlOf(int bytes, byte first = 0x04)
    {
        var data = new byte[bytes];
        data[0] = first;
        return Base64Url.EncodeToString(data);
    }

    private static TurnOnRemindersCommand Subscription(string endpoint = "https://fcm.googleapis.com/fcm/send/abc:def") =>
        new(endpoint, Base64UrlOf(PushDevices.P256dhBytes), Base64UrlOf(PushDevices.AuthBytes, 1), new TimeOnly(7, 0), true);

    [Fact]
    public void A_browsers_subscription_is_accepted()
    {
        new TurnOnRemindersValidator(new GoogleOnly()).Validate(Subscription()).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("http://fcm.googleapis.com/fcm/send/abc")]
    [InlineData("https://fcm.googleapis.com:8443/fcm/send/abc")]
    [InlineData("https://user@fcm.googleapis.com/fcm/send/abc")]
    [InlineData("https://example.com/fcm/send/abc")]
    [InlineData("https://169.254.169.254/latest/meta-data")]
    [InlineData("/relative")]
    public void Only_a_push_service_can_be_the_endpoint(string endpoint)
    {
        var result = new TurnOnRemindersValidator(new GoogleOnly()).Validate(Subscription(endpoint));

        result.Errors.ShouldContain(e => e.PropertyName == nameof(TurnOnRemindersCommand.Endpoint));
    }

    [Fact]
    public void Keys_must_be_the_sizes_browsers_issue()
    {
        var validator = new TurnOnRemindersValidator(new GoogleOnly());

        validator.Validate(Subscription() with { P256dh = Base64UrlOf(64) }).IsValid.ShouldBeFalse();
        validator.Validate(Subscription() with { P256dh = Base64UrlOf(65, first: 0x02) }).IsValid.ShouldBeFalse();
        validator.Validate(Subscription() with { Auth = Base64UrlOf(15) }).IsValid.ShouldBeFalse();
        validator.Validate(Subscription() with { Auth = "not base64!" }).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void A_device_is_known_by_a_hash_of_its_endpoint()
    {
        var key = PushDevices.KeyOf("https://fcm.googleapis.com/fcm/send/abc:def");

        key.Length.ShouldBe(PushSubscription.DeviceKeyLength);
        key.ShouldBe(key.ToLowerInvariant());
        key.ShouldNotContain("fcm");
    }
}
