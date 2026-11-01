using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Insights;
using StartLine.Application.Features.Onboarding;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Sync;
using StartLine.Infrastructure.Email;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>An app whose emails land in a list instead of Brevo, with the onboarding settings a test gives it.</summary>
public sealed class OnboardingFactory(IDictionary<string, string?>? settings = null) : StartLineApiFactory
{
    public RecapFactory.Outbox Mail { get; } = new();

    protected override IDictionary<string, string?> Settings => settings ?? new Dictionary<string, string?>();

    protected override void ConfigureServices(IServiceCollection services)
    {
        services.RemoveAll<IEmailSender>();
        services.AddSingleton<IEmailSender>(Mail);
    }
}

/// <summary>
/// The onboarding emails against a real (disposable, local) SQL database, synthetic runners and a fake clock. Each test
/// drives one runner through <see cref="IOnboardingReminders.SendToAsync"/> (the unit of work the worker repeats), or the
/// batch through <see cref="IOnboardingReminders.SendDueAsync"/>, and reads the fake outbox: no email leaves the machine.
/// </summary>
public sealed class OnboardingReminderTests
{
    private static readonly OnboardingBudget Unlimited = new(1000, 1000, 1_000_000);

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    { var body = await response.Content.ReadAsStringAsync(); response.IsSuccessStatusCode.ShouldBeTrue(body); return JsonDocument.Parse(body).RootElement; }

    private sealed record Signup(HttpClient Client, string Email, Guid Id);

    private static async Task<Signup> Runner(OnboardingFactory factory, string name = "Naledi Dlamini", bool weekly = false, bool withEmail = true)
    {
        var email = $"{Guid.NewGuid():N}@example.com";
        var client = factory.CreateClient().As(Guid.NewGuid().ToString(), withEmail ? email : null);
        var me = await Json(await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = name, timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = weekly, acceptPrivacyNotice = true }));
        return new(client, email, me.GetProperty("id").GetGuid());
    }

    private static async Task<Guid> Plan(OnboardingFactory factory, HttpClient client, string race = "Onboarding 10K", bool replace = false)
    {
        var today = DateOnly.FromDateTime(factory.Time.GetUtcNow().UtcDateTime);
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
        var plan = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new
        {
            plan = new
            {
                raceName = race,
                distanceKm = 10,
                raceDate = Iso(monday.AddDays(76)),
                goalTime = "00:58:00",
                runDays = new[] { "Tuesday", "Thursday", "Sunday" },
                longRunDay = "Sunday",
                currentWeeklyKm = 15,
                planFrom = Iso(monday),
                version = 2,
            },
            replaceCurrent = replace,
        }));
        return plan.GetProperty("id").GetGuid();
    }

    private static string Iso(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static DateOnly Today(OnboardingFactory factory) => DateOnly.FromDateTime(factory.Time.GetUtcNow().UtcDateTime);

    private static async Task Db(OnboardingFactory factory, Func<StartLineDbContext, Task> act)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        await act(db);
        await db.SaveChangesAsync();
    }

    private static Task CheckIn(OnboardingFactory factory, Guid plan, DateOnly day, CheckInStatus status = CheckInStatus.Done) =>
        Db(factory, db => { db.SessionCheckIns.Add(SessionCheckIn.Create(plan, day, SessionType.Easy, new CheckInAnswers(status, status == CheckInStatus.Skipped ? null : 4))); return Task.CompletedTask; });

    private static Task Run(OnboardingFactory factory, Guid runner, DateOnly day, ActivityOrigin origin)
    {
        var recording = new ActivityRecording(new DateTimeOffset(day.ToDateTime(new TimeOnly(6, 0)), TimeSpan.Zero), ActivityKind.Run,
            [new(TimeSpan.Zero, 0), new(TimeSpan.FromMinutes(40), 6000)], DeviceTotals.None);
        return Db(factory, db => { db.Activities.Add(Activity.Record(runner, recording, day, [], origin)); return Task.CompletedTask; });
    }

    private static Task Upload(OnboardingFactory factory, Guid runner, DateOnly day) => Run(factory, runner, day, ActivityOrigin.Uploaded("run.fit"));

    private static Task Synced(OnboardingFactory factory, Guid runner, DateOnly day, DateTimeOffset fetchedAt) =>
        Run(factory, runner, day, ActivityOrigin.Strava(Random.Shared.NextInt64(1, long.MaxValue), fetchedAt, recordedOnGarmin: false));

    private static async Task<OnboardingOutcome> SendTo(OnboardingFactory factory, Guid runner)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IOnboardingReminders>().SendToAsync(runner, factory.Time.GetUtcNow(), CancellationToken.None);
    }

    private static async Task<OnboardingRun> SendDue(OnboardingFactory factory, OnboardingBudget budget)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IOnboardingReminders>().SendDueAsync(factory.Time.GetUtcNow(), budget, CancellationToken.None);
    }

    private static async Task<List<OnboardingDelivery>> Deliveries(OnboardingFactory factory, Guid runner)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().OnboardingDeliveries.AsNoTracking().Where(d => d.RunnerId == runner).ToListAsync();
    }

    [Fact]
    public async Task A_runner_without_a_plan_gets_one_email_at_48_hours_that_unsubscribes_from_updates_and_not_the_recap()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 1, 4, 9, 0, 0, TimeSpan.Zero));
        var runner = await Runner(factory, weekly: true);

        factory.Time.Advance(TimeSpan.FromHours(48) - TimeSpan.FromMinutes(1));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.NotDue);
        factory.Time.Advance(TimeSpan.FromMinutes(1));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.Sent);
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.AlreadyHandled);
        factory.Time.Advance(TimeSpan.FromDays(30));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.AlreadyHandled);

        var mail = factory.Mail.To(runner.Email).ShouldHaveSingleItem();
        mail.Subject.ShouldBe("Your starting line is waiting");
        mail.Html.ShouldContain("Hi Naledi.");
        mail.Html.ShouldContain("https://taperday.run/?view=build");
        mail.Text.ShouldContain("Build my training plan: https://taperday.run/?view=build");
        var links = mail.Unsubscribe.ShouldNotBeNull();
        links.Page.Query.ShouldNotContain("list=weekly");
        BrevoEmailSender.Headers(links).ShouldNotBeNull()["List-Unsubscribe-Post"].ShouldBe("List-Unsubscribe=One-Click");
        var delivery = (await Deliveries(factory, runner.Id)).ShouldHaveSingleItem();
        delivery.Status.ShouldBe(OnboardingDeliveryStatus.Sent);
        delivery.Campaign.ShouldBe(OnboardingCampaign.StartPlan);

        // The mail app's one-click unsubscribe stops news and updates; the weekly recap stays on.
        var token = Uri.UnescapeDataString(links.OneClick.Query.Split("t=")[1]);
        (await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/unsubscribe"), new { token })).EnsureSuccessStatusCode();
        var me = await Json(await runner.Client.GetAsync(Url("/api/v1/me")));
        me.GetProperty("updateEmails").GetBoolean().ShouldBeFalse();
        me.GetProperty("weeklyEmails").GetBoolean().ShouldBeTrue();

        // Now a plan and no run would be the next email, but they've said no.
        await Plan(factory, runner.Client);
        factory.Time.Advance(TimeSpan.FromDays(8));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.NotDue);
    }

    [Fact]
    public async Task A_plan_built_by_48_hours_or_kept_only_as_archived_means_no_start_plan_email()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 2, 1, 9, 0, 0, TimeSpan.Zero));
        var quick = await Runner(factory);
        var archived = await Runner(factory);

        factory.Time.Advance(TimeSpan.FromHours(47));
        await Plan(factory, quick.Client);
        // Another race replaces the first plan, which is archived; the new one is then removed outright.
        await Plan(factory, archived.Client, "First race");
        var replacement = await Plan(factory, archived.Client, "Second race", replace: true);
        (await archived.Client.DeleteAsync(Url($"/api/v1/me/plans/{replacement}"))).EnsureSuccessStatusCode();
        await Db(factory, async db => (await db.SavedPlans.Where(p => p.RunnerId == archived.Id).Select(p => p.Status).ToListAsync())
            .ShouldBe(new[] { SavedPlanStatus.Archived }));

        factory.Time.Advance(TimeSpan.FromHours(1));
        (await SendTo(factory, quick.Id)).ShouldBe(OnboardingOutcome.NotDue);
        (await SendTo(factory, archived.Id)).ShouldBe(OnboardingOutcome.NotDue);

        // An archived plan is still a plan: a week on, with no run, it's "your first run".
        factory.Time.Advance(TimeSpan.FromDays(7));
        (await SendTo(factory, archived.Id)).ShouldBe(OnboardingOutcome.Sent);
        factory.Mail.To(archived.Email).ShouldHaveSingleItem().Subject.ShouldBe("Your first run is waiting");
        factory.Mail.To(quick.Email).Select(m => m.Subject).ShouldNotContain("Your starting line is waiting");
    }

    [Fact]
    public async Task Opted_out_emailless_and_deleted_runners_get_nothing()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 3, 1, 9, 0, 0, TimeSpan.Zero));
        var optedOut = await Runner(factory);
        await Json(await optedOut.Client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Naledi", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true, updateEmails = false }));
        var noEmail = await Runner(factory, withEmail: false);
        var deleted = await Runner(factory);
        (await deleted.Client.DeleteAsync(Url("/api/v1/me"))).EnsureSuccessStatusCode();

        factory.Time.Advance(TimeSpan.FromDays(3));
        (await SendTo(factory, optedOut.Id)).ShouldBe(OnboardingOutcome.NotDue);
        (await SendTo(factory, noEmail.Id)).ShouldBe(OnboardingOutcome.NotDue);
        (await SendTo(factory, deleted.Id)).ShouldBe(OnboardingOutcome.NotDue);
        factory.Mail.To(optedOut.Email).ShouldBeEmpty();
        factory.Mail.To(deleted.Email).ShouldBeEmpty();
        (await Deliveries(factory, optedOut.Id)).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_plan_and_no_run_gets_your_first_run_at_seven_days_unless_a_run_is_recorded_or_Strava_holds_one()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 4, 5, 9, 0, 0, TimeSpan.Zero));
        var plain = await Runner(factory);
        var skippedOnly = await Runner(factory);
        var ticked = await Runner(factory);
        var uploaded = await Runner(factory);
        var syncing = await Runner(factory);
        var lapsed = await Runner(factory);
        var unreachable = await Runner(factory);
        var plans = new Dictionary<Guid, Guid>();
        foreach (var r in new[] { plain, skippedOnly, ticked, uploaded, syncing, lapsed, unreachable })
        {
            plans[r.Id] = await Plan(factory, r.Client);
        }

        factory.Time.Advance(TimeSpan.FromDays(7) - TimeSpan.FromMinutes(1));
        (await SendTo(factory, plain.Id)).ShouldBe(OnboardingOutcome.NotDue);
        factory.Time.Advance(TimeSpan.FromMinutes(1));
        var now = factory.Time.GetUtcNow();
        await CheckIn(factory, plans[skippedOnly.Id], Today(factory).AddDays(-2), CheckInStatus.Skipped);
        await CheckIn(factory, plans[ticked.Id], Today(factory).AddDays(-2));
        await Upload(factory, uploaded.Id, Today(factory).AddDays(-3));
        // Partial synced data: one run still in the cache, one whose 7 days have lapsed but not yet been cleared away.
        await Synced(factory, syncing.Id, Today(factory).AddDays(-1), now.AddHours(-2));
        await Synced(factory, lapsed.Id, Today(factory).AddDays(-8), now.AddDays(-8));
        await Db(factory, db =>
        {
            var connection = ProviderConnection.Connect(unreachable.Id, SyncProvider.Strava, Random.Shared.NextInt64(1, long.MaxValue), "read", new("protected-access", "protected-refresh", now.AddHours(1)), now);
            connection.RequireReconnect();
            db.ProviderConnections.Add(connection);
            return Task.CompletedTask;
        });

        (await SendTo(factory, plain.Id)).ShouldBe(OnboardingOutcome.Sent);
        (await SendTo(factory, skippedOnly.Id)).ShouldBe(OnboardingOutcome.Sent);
        (await SendTo(factory, ticked.Id)).ShouldBe(OnboardingOutcome.NotDue);
        (await SendTo(factory, uploaded.Id)).ShouldBe(OnboardingOutcome.NotDue);
        (await SendTo(factory, syncing.Id)).ShouldBe(OnboardingOutcome.NotDue);
        (await SendTo(factory, lapsed.Id)).ShouldBe(OnboardingOutcome.Sent);
        (await SendTo(factory, unreachable.Id)).ShouldBe(OnboardingOutcome.NotDue);

        var mail = factory.Mail.To(plain.Email).ShouldHaveSingleItem();
        mail.Subject.ShouldBe("Your first run is waiting");
        mail.Html.ShouldContain("https://taperday.run/?view=home");
        // Nothing about the Strava run was kept to decide it.
        (await Deliveries(factory, syncing.Id)).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_runner_gone_quiet_gets_one_nudge_per_quiet_spell_and_no_second_within_sixty_days()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 5, 3, 9, 0, 0, TimeSpan.Zero));
        var runner = await Runner(factory);
        var plan = await Plan(factory, runner.Client);
        factory.Time.Advance(TimeSpan.FromDays(2));
        var lastRun = Today(factory);
        await CheckIn(factory, plan, lastRun);

        // Quiet from the end of the run's day: 21 days later, less a minute, is too soon.
        factory.Time.SetUtcNow(new DateTimeOffset(lastRun.AddDays(22).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero).AddMinutes(-1));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.NotDue);
        factory.Time.Advance(TimeSpan.FromMinutes(1));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.Sent);
        var first = factory.Time.GetUtcNow();
        factory.Mail.To(runner.Email).ShouldHaveSingleItem().Subject.ShouldBe("Ready when you are");

        // Still quiet: never a second nudge for the same spell.
        factory.Time.Advance(TimeSpan.FromDays(3));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.AlreadyHandled);

        // Ran again (an upload), then went quiet again, inside 60 days of the first nudge: held back.
        factory.Time.SetUtcNow(first.AddDays(5));
        var ranAgain = Today(factory);
        await Upload(factory, runner.Id, ranAgain);
        factory.Time.SetUtcNow(first.AddDays(60).AddMinutes(-1));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.NotDue);
        factory.Time.SetUtcNow(first.AddDays(60));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.Sent);
        factory.Time.Advance(TimeSpan.FromDays(120));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.AlreadyHandled);

        factory.Mail.To(runner.Email).Count.ShouldBe(2);
        (await Deliveries(factory, runner.Id)).Select(d => d.Episode).Order(StringComparer.Ordinal).ShouldBe(new[] { Iso(lastRun), Iso(ranAgain) });
    }

    [Fact]
    public async Task Runs_uploaded_without_a_plan_still_get_the_build_a_plan_email()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 6, 7, 9, 0, 0, TimeSpan.Zero));
        var runner = await Runner(factory);
        await Upload(factory, runner.Id, Today(factory).AddDays(-60));
        factory.Time.Advance(TimeSpan.FromDays(30));

        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.Sent);
        factory.Mail.To(runner.Email).ShouldHaveSingleItem().Subject.ShouldBe("Your starting line is waiting");
    }

    [Fact]
    public async Task Competing_workers_send_once()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 7, 5, 9, 0, 0, TimeSpan.Zero));
        var runner = await Runner(factory);
        factory.Time.Advance(TimeSpan.FromDays(3));

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => Task.Run(() => SendTo(factory, runner.Id))));
        outcomes.Count(o => o == OnboardingOutcome.Sent).ShouldBe(1);
        outcomes.ShouldAllBe(o => o == OnboardingOutcome.Sent || o == OnboardingOutcome.AlreadyHandled);
        factory.Mail.To(runner.Email).ShouldHaveSingleItem();
        (await Deliveries(factory, runner.Id)).ShouldHaveSingleItem();
    }

    [Fact]
    public async Task A_failed_send_is_retried_at_most_three_times_in_all()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 8, 2, 9, 0, 0, TimeSpan.Zero));
        var flaky = await Runner(factory);
        var down = await Runner(factory);
        factory.Mail.FailuresFor[flaky.Email] = 1;
        factory.Mail.FailuresFor[down.Email] = 10;
        factory.Time.Advance(TimeSpan.FromDays(3));

        (await SendTo(factory, flaky.Id)).ShouldBe(OnboardingOutcome.Failed);
        factory.Time.Advance(TimeSpan.FromMinutes(30));
        (await SendTo(factory, flaky.Id)).ShouldBe(OnboardingOutcome.Sent);
        factory.Mail.To(flaky.Email).ShouldHaveSingleItem();
        (await Deliveries(factory, flaky.Id)).ShouldHaveSingleItem().Attempts.ShouldBe(2);

        for (var i = 0; i < OnboardingDelivery.MaxAttempts; i++)
        {
            (await SendTo(factory, down.Id)).ShouldBe(OnboardingOutcome.Failed);
            factory.Time.Advance(TimeSpan.FromMinutes(30));
        }

        (await SendTo(factory, down.Id)).ShouldBe(OnboardingOutcome.AlreadyHandled);
        factory.Mail.FailuresFor[down.Email].ShouldBe(10 - OnboardingDelivery.MaxAttempts);
        var given = (await Deliveries(factory, down.Id)).ShouldHaveSingleItem();
        given.Status.ShouldBe(OnboardingDeliveryStatus.Failed);
        given.Attempts.ShouldBe(OnboardingDelivery.MaxAttempts);
    }

    [Fact]
    public async Task A_claim_left_mid_send_by_a_crash_is_never_resent()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 9, 6, 9, 0, 0, TimeSpan.Zero));
        var runner = await Runner(factory);
        factory.Time.Advance(TimeSpan.FromDays(3));
        await Db(factory, db => { db.OnboardingDeliveries.Add(OnboardingDelivery.Claim(runner.Id, OnboardingCampaign.StartPlan, "", factory.Time.GetUtcNow().AddHours(-1))); return Task.CompletedTask; });

        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.AlreadyHandled);
        factory.Time.Advance(TimeSpan.FromDays(1));
        (await SendTo(factory, runner.Id)).ShouldBe(OnboardingOutcome.AlreadyHandled);
        factory.Mail.To(runner.Email).ShouldBeEmpty();
        (await Deliveries(factory, runner.Id)).ShouldHaveSingleItem().Status.ShouldBe(OnboardingDeliveryStatus.Sending);
    }

    [Fact]
    public async Task Older_signups_trickle_out_within_the_run_and_day_limits_newest_first_and_repeated_runs_send_once()
    {
        await using var factory = new OnboardingFactory();
        // Later than any other test's clock, so these are the newest signups in the shared test database.
        factory.Time.SetUtcNow(new DateTimeOffset(2029, 3, 1, 9, 0, 0, TimeSpan.Zero));
        List<Signup> runners = [];
        for (var i = 0; i < 8; i++)
        {
            runners.Add(await Runner(factory));
            factory.Time.Advance(TimeSpan.FromMinutes(1));
        }

        factory.Time.Advance(TimeSpan.FromDays(60));
        var budget = new OnboardingBudget(MaxPerRun: 3, DailyLimit: 5, DailyEmailBudget: 1_000_000);
        (await SendDue(factory, budget)).Sent.ShouldBe(3);
        runners.TakeLast(3).ShouldAllBe(r => factory.Mail.To(r.Email).Count == 1);
        factory.Time.Advance(TimeSpan.FromMinutes(30));
        (await SendDue(factory, budget)).Sent.ShouldBe(2);
        factory.Time.Advance(TimeSpan.FromMinutes(30));
        (await SendDue(factory, budget)).Sent.ShouldBe(0);
        factory.Mail.Sent.Count.ShouldBe(5);

        factory.Time.Advance(TimeSpan.FromDays(1));
        (await SendDue(factory, budget)).Sent.ShouldBe(3);
        runners.ShouldAllBe(r => factory.Mail.To(r.Email).Count == 1);

        // The schedule running again and again sends nobody a second copy.
        for (var i = 0; i < 3; i++)
        {
            factory.Time.Advance(TimeSpan.FromDays(1));
            await SendDue(factory, budget);
        }

        runners.ShouldAllBe(r => factory.Mail.To(r.Email).Count == 1);
    }

    [Fact]
    public async Task It_is_off_by_default_and_sends_nothing_to_runners()
    {
        await using var factory = new OnboardingFactory();
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 10, 4, 9, 0, 0, TimeSpan.Zero));
        var runner = await Runner(factory);
        factory.Services.GetRequiredService<IOptions<OnboardingReminderOptions>>().Value.Enabled.ShouldBeFalse();

        for (var i = 0; i < 8; i++)
        {
            factory.Time.Advance(TimeSpan.FromHours(12));
        }

        factory.Mail.Sent.ShouldBeEmpty();
        (await Deliveries(factory, runner.Id)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Switched_on_the_worker_sends_on_its_schedule()
    {
        await using var factory = new OnboardingFactory(new Dictionary<string, string?> { ["OnboardingReminder:Enabled"] = "true" });
        factory.Time.SetUtcNow(new DateTimeOffset(2030, 1, 7, 9, 0, 0, TimeSpan.Zero));
        var runner = await Runner(factory);

        factory.Time.Advance(TimeSpan.FromDays(2));
        // Each check moves the clock on by one of the worker's waits, so its next run comes round whenever it started waiting.
        var mail = await Eventually(() => factory.Mail.To(runner.Email).SingleOrDefault(), () => factory.Time.Advance(TimeSpan.FromMinutes(30)));
        mail.Subject.ShouldBe("Your starting line is waiting");
    }

    [Fact]
    public async Task The_preview_sends_each_email_made_up_to_the_test_address_only()
    {
        await using var factory = new OnboardingFactory(new Dictionary<string, string?> { ["OnboardingReminder:TestTo"] = "maker@example.com" });
        factory.Time.SetUtcNow(new DateTimeOffset(2027, 11, 1, 9, 0, 0, TimeSpan.Zero));
        factory.CreateClient().Dispose();

        var previews = await Eventually(() => factory.Mail.To("maker@example.com") is { Count: 3 } all ? all : null);
        previews.Select(p => p.Subject).ShouldBe(new[] { "[Test] Your starting line is waiting", "[Test] Your first run is waiting", "[Test] Ready when you are" }, ignoreOrder: true);
        previews.ShouldAllBe(p => p.Unsubscribe == null && p.Html.Contains("Hi Sample.", StringComparison.Ordinal));
        factory.Mail.Sent.Count.ShouldBe(3);
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
