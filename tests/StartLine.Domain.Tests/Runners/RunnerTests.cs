using StartLine.Domain.Common;
using StartLine.Domain.Runners;

namespace StartLine.Domain.Tests.Runners;

public sealed class RunnerTests
{
    private static Runner Thandi(int? maxHeartRate = null) => Runner.Register(
        "oid-1", "thandi@example.com", "Thandi", "Africa/Johannesburg", Units.Kilometres, false, "2026-10-09",
        new DateTimeOffset(2026, 10, 9, 8, 0, 0, TimeSpan.Zero), maxHeartRate);

    [Fact]
    public void Max_heart_rate_is_optional() => Thandi().MaxHeartRate.ShouldBeNull();

    [Fact]
    public void A_max_heart_rate_can_be_set_and_cleared()
    {
        var runner = Thandi(186);
        runner.MaxHeartRate.ShouldBe(186);

        runner.UpdateProfile(runner.Email, runner.DisplayName, runner.TimeZone, runner.Units, runner.WeeklyEmails);

        runner.MaxHeartRate.ShouldBeNull();
    }

    [Theory]
    [InlineData(119)]
    [InlineData(231)]
    public void An_implausible_max_heart_rate_is_refused(int bpm) => Should.Throw<DomainException>(() => Thandi(bpm));
}

public sealed class RunnerConsentTests
{
    private static readonly DateTimeOffset SignedUpAt = new(2026, 10, 9, 8, 0, 0, TimeSpan.Zero);

    private static Runner Register(bool heartRateConsent = false) => Runner.Register(
        "oid-2", null, "Sipho", "Africa/Johannesburg", Units.Kilometres, false, "2026-10-09", SignedUpAt, heartRateConsent: heartRateConsent);

    [Fact]
    public void Heart_rate_consent_is_off_unless_given()
    {
        var runner = Register();

        runner.HeartRateConsent.ShouldBeFalse();
        runner.HeartRateConsentChangedAt.ShouldBe(SignedUpAt);
    }

    [Fact]
    public void Withdrawing_heart_rate_consent_says_so_so_stored_heart_rate_can_go()
    {
        var runner = Register(heartRateConsent: true);
        var later = SignedUpAt.AddDays(3);

        runner.SetHeartRateConsent(true, later).ShouldBeFalse();
        runner.HeartRateConsentChangedAt.ShouldBe(SignedUpAt);
        runner.SetHeartRateConsent(false, later).ShouldBeTrue();
        runner.HeartRateConsent.ShouldBeFalse();
        runner.HeartRateConsentChangedAt.ShouldBe(later);
        runner.SetHeartRateConsent(false, later.AddDays(1)).ShouldBeFalse();
    }

    [Fact]
    public void Accepting_a_new_notice_records_its_version_and_when()
    {
        var runner = Register();
        var at = SignedUpAt.AddDays(12);

        runner.HasAccepted("2026-10-21").ShouldBeFalse();
        runner.AcceptPrivacyNotice("2026-10-21", at);

        runner.HasAccepted("2026-10-21").ShouldBeTrue();
        runner.HasAccepted("2026-10-09").ShouldBeFalse();
        runner.ConsentedAt.ShouldBe(at);
    }

    [Fact]
    public void A_notice_needs_a_version() =>
        Should.Throw<DomainException>(() => Register().AcceptPrivacyNotice(" ", SignedUpAt));
}

public sealed class RunnerCalendarTests
{
    private const string First = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    private const string Second = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

    private static Runner Register() => Runner.Register(
        "oid-3", null, "Lerato", "Africa/Johannesburg", Units.Kilometres, false, "2026-10-09", new DateTimeOffset(2026, 10, 9, 8, 0, 0, TimeSpan.Zero));

    [Fact]
    public void A_runner_has_no_calendar_link_until_they_ask_for_one() => Register().CalendarToken.ShouldBeNull();

    [Fact]
    public void Issuing_gives_the_new_secret_the_first_time_and_the_same_one_after()
    {
        var runner = Register();

        runner.IssueCalendarToken(First).ShouldBe(First);
        runner.IssueCalendarToken(Second).ShouldBe(First);
        runner.CalendarToken.ShouldBe(First);
    }

    [Fact]
    public void Resetting_replaces_the_secret_so_the_old_link_stops()
    {
        var runner = Register();
        runner.IssueCalendarToken(First);

        runner.ResetCalendarToken(Second);

        runner.CalendarToken.ShouldBe(Second);
    }

    [Fact]
    public void A_reset_can_also_be_the_first_link()
    {
        var runner = Register();

        runner.ResetCalendarToken(First);

        runner.CalendarToken.ShouldBe(First);
    }

    [Fact]
    public void A_reset_to_the_same_secret_is_refused()
    {
        var runner = Register();
        runner.IssueCalendarToken(First);

        Should.Throw<DomainException>(() => runner.ResetCalendarToken(First));
    }

    [Theory]
    [InlineData("")]
    [InlineData("too-short")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAA AAAAAAAAAAAAAAAAAAAA")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    public void A_secret_that_could_be_guessed_or_wont_fit_is_refused(string token)
    {
        var runner = Register();

        Should.Throw<DomainException>(() => runner.IssueCalendarToken(token));
        Should.Throw<DomainException>(() => runner.ResetCalendarToken(token));
        runner.CalendarToken.ShouldBeNull();
    }
}

public sealed class RunnerUpdateEmailTests
{
    private static readonly DateTimeOffset SignedUpAt = new(2026, 10, 9, 8, 0, 0, TimeSpan.Zero);

    private static Runner Register() => Runner.Register(
        "oid-4", "lerato@example.com", "Lerato", "Africa/Johannesburg", Units.Kilometres, false, "2026-10-09", SignedUpAt);

    [Fact]
    public void Update_emails_are_on_for_a_new_runner()
    {
        var runner = Register();

        runner.UpdateEmails.ShouldBeTrue();
        runner.UpdateEmailsOffAt.ShouldBeNull();
    }

    [Fact]
    public void Turning_update_emails_off_twice_keeps_the_first_time()
    {
        var runner = Register();
        var first = SignedUpAt.AddDays(3);

        runner.TurnOffUpdateEmails(first);
        runner.TurnOffUpdateEmails(first.AddHours(1));

        runner.UpdateEmails.ShouldBeFalse();
        runner.UpdateEmailsOffAt.ShouldBe(first);
    }

    [Fact]
    public void Update_emails_can_be_turned_back_on()
    {
        var runner = Register();
        runner.TurnOffUpdateEmails(SignedUpAt.AddDays(3));

        runner.TurnOnUpdateEmails();

        runner.UpdateEmails.ShouldBeTrue();
        runner.UpdateEmailsOffAt.ShouldBeNull();
    }
}
