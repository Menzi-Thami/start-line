using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Features.CheckIns;
using StartLine.Application.Features.Notifications;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;

namespace StartLine.Application.Tests.Features;

/// <summary>A tick is a check-in like any other, made by the runner: from the app, or from a notification's button.</summary>
public sealed class TickTests
{
    private static readonly FakeTimeProvider Time = new(new DateTimeOffset(2026, 10, 20, 8, 0, 0, TimeSpan.Zero));

    private static SaveCheckInCommand Answer(CheckInStatus status, int? effort) =>
        new(Guid.NewGuid(), new DateOnly(2026, 10, 20), SessionType.Tempo, status, effort);

    [Fact]
    public void Done_on_its_own_is_a_tick_with_no_effort()
    {
        new SaveCheckInValidator(Time).Validate(Answer(CheckInStatus.Done, null)).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData(CheckInStatus.CutShort)]
    [InlineData(CheckInStatus.SwappedForEasy)]
    public void A_run_cut_short_or_swapped_still_says_how_it_felt(CheckInStatus status)
    {
        var result = new SaveCheckInValidator(Time).Validate(Answer(status, null));

        result.Errors.ShouldContain(e => e.PropertyName == nameof(SaveCheckInCommand.Effort));
    }

    [Fact]
    public void A_notification_tick_needs_its_key()
    {
        new TickFromNotificationValidator().Validate(new TickFromNotificationCommand("")).IsValid.ShouldBeFalse();
        new TickFromNotificationValidator().Validate(new TickFromNotificationCommand(new string('k', TickFromNotificationValidator.MaxTokenLength + 1))).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void A_tap_on_the_prompt_opens_home_on_that_session()
    {
        RunCelebrator.OpensAt(Guid.Parse("b633263b-c9d9-43c2-8dfc-3800b4e017f1")).ShouldBe("/?view=runs&run=b633263b-c9d9-43c2-8dfc-3800b4e017f1");
    }
}
