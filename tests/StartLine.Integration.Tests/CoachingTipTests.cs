using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.CoachingTips;
using StartLine.Application.Features.Onboarding;
using StartLine.Domain.Runners;
using StartLine.Infrastructure.Email;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>
/// The Thursday coaching tip against a real (disposable, local) SQL database, synthetic runners and a fake clock: 07:00 to
/// 08:00 on each runner's own Thursday, once per runner and Thursday whatever runs it, stopped by the weekly unsubscribe,
/// chosen from the runner's plan and kept running, and previewed without writing anything. No email leaves the machine.
/// The database is shared with other test classes, so the batch tests use time zones no other test uses (Kathmandu, Tokyo):
/// at those instants no other test's runner is in their Thursday sending hour.
/// </summary>
public sealed class CoachingTipTests
{
    private static readonly CoachingTipBudget Unlimited = new(1_000_000);

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); response.IsSuccessStatusCode.ShouldBeTrue(body); return JsonDocument.Parse(body).RootElement; }

    private sealed record Signup(HttpClient Client, string Email, Guid Id);

    private static async Task<Signup> Runner(OnboardingFactory factory, string timeZone = "Africa/Johannesburg", bool weekly = true, bool withEmail = true)
    {
        var email = $"{Guid.NewGuid():N}@example.com";
        var client = factory.CreateClient().As(Guid.NewGuid().ToString(), withEmail ? email : null);
        var me = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Naledi Dlamini", timeZone, units = "Kilometres", weeklyEmails = weekly, acceptPrivacyNotice = true }));
        return new(client, email, me.GetProperty("id").GetGuid());
    }

    private static async Task<Guid> Plan(HttpClient client, string raceDate, string planFrom, string experience = "Regular")
    {
        var plan = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            plan = new { raceName = "Tip 10K", distanceKm = 10, raceDate, goalTime = "00:55:00", runDays = new[] { "Monday", "Wednesday", "Friday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 25, experience, planFrom, version = 2 },
        }));
        return plan.GetProperty("id").GetGuid();
    }

    private static async Task Ran(HttpClient client, Guid plan, string date, double km) =>
        await Json(await client.PutAsJsonAsync(Url($"/api/v1/me/plans/{plan}/check-ins/additional/{Guid.NewGuid()}/{date}/Easy"), new { status = "Done", actualSessionType = "Easy", distanceKm = km, duration = TimeSpan.FromMinutes(km * 6).ToString(@"hh\:mm\:ss", System.Globalization.CultureInfo.InvariantCulture) }));

    private static async Task<CoachingTipOutcome> SendTo(OnboardingFactory factory, Guid runner)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ICoachingTips>().SendToAsync(runner, factory.Time.GetUtcNow(), CancellationToken.None);
    }

    private static async Task<CoachingTipRun> SendDue(OnboardingFactory factory, CoachingTipBudget? budget = null)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ICoachingTips>().SendDueAsync(factory.Time.GetUtcNow(), budget ?? Unlimited, CancellationToken.None);
    }

    private static async Task<List<OnboardingDelivery>> Tips(OnboardingFactory factory, Guid? runner = null)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().OnboardingDeliveries.AsNoTracking()
            .Where(d => d.Campaign == OnboardingCampaign.CoachingTip && (runner == null || d.RunnerId == runner))
            .ToListAsync();
    }

    private static DateTimeOffset Utc(int year, int month, int day, int hour, int minute) => new(year, month, day, hour, minute, 0, TimeSpan.Zero);

    [Fact]
    public async Task Each_runner_gets_one_tip_between_seven_and_eight_on_their_own_Thursday()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var kathmandu = await Runner(factory, "Asia/Kathmandu");
        var tokyo = await Runner(factory, "Asia/Tokyo");

        // Wednesday 07:30 in Kathmandu: not Thursday.
        factory.Time.SetUtcNow(Utc(2026, 11, 18, 1, 45));
        await SendDue(factory);
        factory.Mail.To(kathmandu.Email).ShouldBeEmpty();

        // Thursday 07:10 in Tokyo (Wednesday 22:10 UTC), 03:55 in Kathmandu. Checking twice sends once.
        factory.Time.SetUtcNow(Utc(2026, 11, 18, 22, 10));
        await SendDue(factory);
        await SendDue(factory);
        var tip = factory.Mail.To(tokyo.Email).ShouldHaveSingleItem();
        factory.Mail.To(kathmandu.Email).ShouldBeEmpty();

        // No plan: track A, its first tip.
        tip.Subject.ShouldBe("Your Taperday tip: The talk test");
        tip.Html.ShouldContain("Hi Naledi.");
        tip.Html.ShouldContain("19 November");
        tip.Unsubscribe.ShouldNotBeNull().Page.Query.ShouldContain("list=weekly");
        var row = (await Tips(factory, tokyo.Id)).ShouldHaveSingleItem();
        (row.Episode, row.TipKey, row.Status).ShouldBe(("2026-11-19", "a-1", OnboardingDeliveryStatus.Sent));

        // Thursday 07:30 in Kathmandu: their turn; Tokyo's hour has passed.
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 1, 45));
        await SendDue(factory);
        factory.Mail.To(kathmandu.Email).ShouldHaveSingleItem().Subject.ShouldBe("Your Taperday tip: The talk test");
        factory.Mail.To(tokyo.Email).Count.ShouldBe(1);
    }

    [Fact]
    public async Task A_missed_hour_is_skipped_never_sent_late()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var runner = await Runner(factory);

        // 06:59 and 08:00 on Thursday in Johannesburg: outside the hour, before and after.
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 4, 59));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.NotDue);
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 6, 0));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.NotDue);

        factory.Mail.To(runner.Email).ShouldBeEmpty();
        (await Tips(factory, runner.Id)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Competing_workers_send_once()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var runner = await Runner(factory);
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 5, 20));

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => Task.Run(() => SendTo(factory, runner.Id))));
        outcomes.Count(o => o == CoachingTipOutcome.Sent).ShouldBe(1);
        outcomes.ShouldAllBe(o => o == CoachingTipOutcome.Sent || o == CoachingTipOutcome.AlreadyHandled);
        factory.Mail.To(runner.Email).ShouldHaveSingleItem();
        (await Tips(factory, runner.Id)).ShouldHaveSingleItem();
    }

    [Fact]
    public async Task A_failed_send_is_tried_again_that_hour_and_then_left_alone()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var runner = await Runner(factory);
        factory.Mail.FailuresFor[runner.Email] = 1;
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 5, 5));

        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Failed);
        factory.Mail.To(runner.Email).ShouldBeEmpty();
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.AlreadyHandled);
        factory.Mail.To(runner.Email).ShouldHaveSingleItem();
        var row = (await Tips(factory, runner.Id)).ShouldHaveSingleItem();
        (row.Attempts, row.TipKey, row.Status).ShouldBe((2, "a-1", OnboardingDeliveryStatus.Sent));
    }

    [Fact]
    public async Task The_weekly_unsubscribe_stops_the_tip_and_leaves_update_emails_on()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var runner = await Runner(factory);
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);
        var links = factory.Mail.To(runner.Email).ShouldHaveSingleItem().Unsubscribe.ShouldNotBeNull();

        // The mail app's one-click unsubscribe, with the tip's own (weekly) key.
        var token = Uri.UnescapeDataString(links.OneClick.Query.Split("t=")[1]);
        (await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token })).EnsureSuccessStatusCode();
        var me = await Json(await runner.Client.GetAsync(Url("/api/v1/me")));
        me.GetProperty("weeklyEmails").GetBoolean().ShouldBeFalse();
        me.GetProperty("updateEmails").GetBoolean().ShouldBeTrue();

        factory.Time.SetUtcNow(Utc(2026, 11, 26, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.NotDue);
        factory.Mail.To(runner.Email).Count.ShouldBe(1);
    }

    [Fact]
    public async Task Weekly_emails_off_or_no_address_means_no_tip()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var optedOut = await Runner(factory, weekly: false);
        var noAddress = await Runner(factory, withEmail: false);
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 5, 30));

        (await SendTo(factory, optedOut.Id)).ShouldBe(CoachingTipOutcome.NotDue);
        (await SendTo(factory, noAddress.Id)).ShouldBe(CoachingTipOutcome.NotDue);
        factory.Mail.To(optedOut.Email).ShouldBeEmpty();
        (await Tips(factory, optedOut.Id)).ShouldBeEmpty();
        (await Tips(factory, noAddress.Id)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Each_Thursday_takes_the_next_step_on_the_runners_track_from_what_was_sent()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var newRunner = await Runner(factory);
        var improving = await Runner(factory);
        var plan = await Plan(improving.Client, "2027-01-17", "2026-11-09");

        List<string> keys = [];
        foreach (var thursday in new[] { 19, 26 })
        {
            factory.Time.SetUtcNow(Utc(2026, 11, thursday, 5, 30));
            await Ran(improving.Client, plan, $"2026-11-{thursday - 1}", 5);
            (await SendTo(factory, newRunner.Id)).ShouldBe(CoachingTipOutcome.Sent);
            (await SendTo(factory, improving.Id)).ShouldBe(CoachingTipOutcome.Sent);
        }

        factory.Time.SetUtcNow(Utc(2026, 12, 3, 5, 30));
        (await SendTo(factory, newRunner.Id)).ShouldBe(CoachingTipOutcome.Sent);

        (await Tips(factory, newRunner.Id)).OrderBy(d => d.Episode).Select(d => d.TipKey).ShouldBe(new[] { "a-1", "a-2", "a-3" });
        (await Tips(factory, improving.Id)).OrderBy(d => d.Episode).Select(d => d.TipKey).ShouldBe(new[] { "b-1", "b-2" });
        factory.Mail.To(improving.Email).Select(m => m.Subject).ShouldBe(new[] { "Your Taperday tip: Trust your plan's paces", "Your Taperday tip: Hill sprints" }, ignoreOrder: true);
    }

    [Fact]
    public async Task A_long_run_jump_in_logged_runs_is_personalised_and_not_sent_again_within_four_weeks()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 16, 9, 0));
        var runner = await Runner(factory);
        var plan = await Plan(runner.Client, "2026-12-20", "2026-10-12");
        await Ran(runner.Client, plan, "2026-11-01", 10);
        await Ran(runner.Client, plan, "2026-11-15", 12);

        factory.Time.SetUtcNow(Utc(2026, 11, 19, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);
        var tip = factory.Mail.To(runner.Email).ShouldHaveSingleItem();
        tip.Subject.ShouldBe("Your Taperday tip: Easy on the long-run jumps");
        tip.Text.ShouldContain("Your longest run this week (12 km) was more than 10% beyond your longest in the previous month (10 km).");
        tip.Text.ShouldContain("Keep the next one nearer 11 km");

        // Only the key is kept: never the distances.
        (await Tips(factory, runner.Id)).ShouldHaveSingleItem().TipKey.ShouldBe("spike");

        // Another jump the week after (14 km after 12): the jump tip went a week ago, so the track's first tip instead.
        factory.Time.SetUtcNow(Utc(2026, 11, 23, 9, 0));
        await Ran(runner.Client, plan, "2026-11-22", 14);
        factory.Time.SetUtcNow(Utc(2026, 11, 26, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);
        (await Tips(factory, runner.Id)).OrderBy(d => d.Episode).Select(d => d.TipKey).ShouldBe(new[] { "spike", "b-1" });
    }

    [Fact]
    public async Task A_quiet_week_on_the_plan_then_the_taper_and_race_week_come_from_the_current_plan()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 10, 12, 9, 0));
        var runner = await Runner(factory);
        await Plan(runner.Client, "2026-12-13", "2026-10-12", experience: "New");

        // Nothing is ever logged. 19 November, 24 days out: a quiet week on the plan, the comeback. 26 November, 17 days
        // out, and 3 December, 10 days: the taper tips, which come before another comeback. 10 December, 3 days: race week.
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);
        factory.Time.SetUtcNow(Utc(2026, 11, 26, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);
        factory.Time.SetUtcNow(Utc(2026, 12, 3, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);
        factory.Time.SetUtcNow(Utc(2026, 12, 10, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);

        (await Tips(factory, runner.Id)).OrderBy(d => d.Episode).Select(d => d.TipKey).ShouldBe(new[] { "comeback", "taper-1", "taper-2", "race-1" });
        factory.Mail.To(runner.Email).ShouldContain(m => m.Subject == "Your Taperday tip: Nothing new on race day");
    }

    [Fact]
    public async Task A_tip_doesnt_hold_back_an_onboarding_email()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2026, 11, 17, 5, 0));
        var runner = await Runner(factory);

        factory.Time.SetUtcNow(Utc(2026, 11, 19, 5, 30));
        (await SendTo(factory, runner.Id)).ShouldBe(CoachingTipOutcome.Sent);

        // 48 hours after signing up with no plan: "Your starting line is waiting" still goes, the tip notwithstanding.
        factory.Time.SetUtcNow(Utc(2026, 11, 19, 6, 30));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            (await scope.ServiceProvider.GetRequiredService<IOnboardingReminders>().SendToAsync(runner.Id, factory.Time.GetUtcNow(), CancellationToken.None))
                .ShouldBe(OnboardingOutcome.Sent);
        }

        factory.Mail.To(runner.Email).Select(m => m.Subject).ShouldBe(new[] { "Your Taperday tip: The talk test", "Your starting line is waiting" }, ignoreOrder: true);
    }

    [Fact]
    public async Task The_daily_email_budget_holds_tips_back_without_claiming_them()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2030, 1, 14, 9, 0));
        var runner = await Runner(factory, "Asia/Kathmandu");

        // Thursday 17 January 2030, 07:30 in Kathmandu.
        factory.Time.SetUtcNow(Utc(2030, 1, 17, 1, 45));
        (await SendDue(factory, new CoachingTipBudget(0))).HeldBack.ShouldBeGreaterThanOrEqualTo(1);
        factory.Mail.To(runner.Email).ShouldBeEmpty();
        (await Tips(factory, runner.Id)).ShouldBeEmpty();

        factory.Time.SetUtcNow(Utc(2030, 1, 17, 2, 0));
        (await SendDue(factory)).Sent.ShouldBeGreaterThanOrEqualTo(1);
        factory.Mail.To(runner.Email).ShouldHaveSingleItem();
    }

    [Fact]
    public async Task It_is_off_by_default_and_sends_nothing_to_runners()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(Utc(2030, 1, 23, 9, 0));
        var runner = await Runner(factory, "Asia/Kathmandu");
        factory.Services.GetRequiredService<IOptions<CoachingTipOptions>>().Value.Enabled.ShouldBeFalse();

        // Through Thursday 24 January 2030 in Kathmandu, in the worker's steps.
        for (var i = 0; i < 12; i++)
        {
            factory.Time.Advance(TimeSpan.FromHours(2));
            await Task.Delay(20);
        }

        factory.Mail.To(runner.Email).ShouldBeEmpty();
        (await Tips(factory, runner.Id)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Switched_on_the_worker_sends_on_its_schedule()
    {
        await using var factory = new OnboardingFactory(new Dictionary<string, string?> { ["CoachingTips:Enabled"] = "true" });

        // Thursday 31 January 2030, 07:00 in Kathmandu. Each check moves the clock a minute, so the worker's next
        // 15-minute wait ends well inside the sending hour.
        factory.Time.SetUtcNow(Utc(2030, 1, 31, 1, 15));
        var runner = await Runner(factory, "Asia/Kathmandu");
        var mail = await Eventually(() => factory.Mail.To(runner.Email).SingleOrDefault(), () => factory.Time.Advance(TimeSpan.FromMinutes(1)));
        mail.Subject.ShouldBe("Your Taperday tip: The talk test");
    }

    [Fact]
    public async Task The_preview_sends_one_per_track_and_the_jump_made_up_to_the_test_address_only_and_writes_nothing()
    {
        var started = Utc(2031, 1, 2, 9, 0);
        await using var factory = new OnboardingFactory(new Dictionary<string, string?> { ["CoachingTips:TestTo"] = "maker@example.com" });
        factory.Time.SetUtcNow(started);
        factory.CreateClient().Dispose();

        var previews = await Eventually(() => factory.Mail.To("maker@example.com") is { Count: 3 } all ? all : null);
        previews.Select(p => p.Subject).ShouldBe(new[] { "[Test] Your Taperday tip: The talk test", "[Test] Your Taperday tip: Trust your plan's paces", "[Test] Your Taperday tip: Easy on the long-run jumps" }, ignoreOrder: true);
        previews.ShouldAllBe(p => p.Unsubscribe == null && p.Html.Contains("Hi Sample.", StringComparison.Ordinal));
        factory.Mail.Sent.Count.ShouldBe(3);
        (await Tips(factory)).ShouldNotContain(d => d.ClaimedAt >= started);
    }

    private static async Task<T> Eventually<T>(Func<T?> read, Action? tick = null)
        where T : class
    {
        for (var i = 0; i < 100; i++)
        {
            if (read() is { } value)
            {
                return value;
            }

            tick?.Invoke();
            await Task.Delay(100);
        }

        throw new TimeoutException("Nothing arrived in time.");
    }
}
