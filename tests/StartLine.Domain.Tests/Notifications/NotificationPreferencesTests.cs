using StartLine.Domain.Common;
using StartLine.Domain.Notifications;

namespace StartLine.Domain.Tests.Notifications;

public sealed class NotificationPreferencesTests
{
    private static PushSubscription Device() => PushSubscription.Start(Guid.NewGuid(), new string('a', 64),
        new("endpoint", "key", "auth"), new(6, 0), true, new(2026, 10, 8, 0, 0, 0));

    [Theory]
    [InlineData(22, 6, 23, 0, 9, 6)]
    [InlineData(22, 6, 5, 59, 8, 6)]
    [InlineData(22, 6, 6, 0, 8, 6)]
    [InlineData(12, 14, 13, 0, 8, 14)]
    [InlineData(12, 14, 14, 0, 8, 14)]
    public void Quiet_hours_handle_both_midnight_and_same_day_boundaries(int start, int end, int hour, int minute, int day, int expectedHour)
    {
        var device = Device();
        device.SetNotificationPreferences(true, true, true, true, true, new(18, 0), new(start, 0), new(end, 0));
        var expectedMinute = hour == 6 || hour == 14 ? minute : 0;
        device.NextAllowed(new(2026, 10, 8, hour, minute, 0)).ShouldBe(new DateTime(2026, 10, day, expectedHour, expectedMinute, 0));
    }

    [Fact]
    public void Existing_devices_keep_congratulations_and_other_new_types_require_a_choice()
    {
        var device = Device();
        device.Allows(NotificationKind.RunCongratulations).ShouldBeTrue();
        device.Allows(NotificationKind.TrainingReview).ShouldBeFalse();
        device.Allows(NotificationKind.LongRunPreparation).ShouldBeFalse();
        device.Allows(NotificationKind.RacePreparation).ShouldBeFalse();
        device.Allows(NotificationKind.ConnectionAlert).ShouldBeFalse();
        var now = new DateTime(2026, 10, 8, 23, 0, 0);
        device.NextAllowed(now).ShouldBe(now);
    }

    [Fact]
    public void Incomplete_or_all_day_quiet_hours_are_rejected()
    {
        var device = Device();
        Should.Throw<DomainException>(() => device.SetNotificationPreferences(true, true, true, true, true, new(18, 0), new(22, 0), null));
        Should.Throw<DomainException>(() => device.SetNotificationPreferences(true, true, true, true, true, new(18, 0), new(6, 0), new(6, 0)));
    }
}
