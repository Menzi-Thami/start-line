using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Notifications;
using StartLine.Domain.Activities;
using StartLine.Domain.Notifications;
using StartLine.Domain.Sync;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

[Collection(RemindersInSeries.Name)]
public sealed class NotificationChoicesTests
{
    private static NotificationPreferencesDto Choices(bool congratulations = true, bool reviews = false, bool longRun = false,
        bool race = false, bool connection = false, TimeOnly? quietStart = null, TimeOnly? quietEnd = null) =>
        new(congratulations, reviews, longRun, race, connection, new(18, 0), quietStart, quietEnd);

    private static async Task<JsonElement> Configure(HttpClient client, string endpoint, NotificationPreferencesDto preferences,
        string morning = "23:00:00", bool daily = false)
    {
        var body = JsonSerializer.SerializeToElement(RemindersFactory.Subscription(endpoint, morning)).EnumerateObject()
            .ToDictionary(p => p.Name, p => (object)p.Value);
        body["preferences"] = preferences;
        body["daily"] = daily;
        var response = await client.PutAsJsonAsync(ReminderClients.Url("/api/v1/me/reminders/devices"), body);
        response.EnsureSuccessStatusCode();
        return await ReminderClients.Json(response);
    }

    private static async Task<(HttpClient Client, Guid Runner, string Endpoint)> Device(RemindersFactory factory, NotificationPreferencesDto preferences,
        string zone = "Africa/Johannesburg")
    {
        var client = await factory.SignedUp(zone);
        var runner = (await client.GetFromJsonAsync<JsonElement>(ReminderClients.Url("/api/v1/me"))).GetProperty("id").GetGuid();
        var endpoint = RemindersFactory.NewEndpoint();
        await Configure(client, endpoint, preferences);
        return (client, runner, endpoint);
    }

    private static DateTimeOffset At(DateOnly day, int localHour, int minute = 0) => new(day.ToDateTime(new(localHour, minute)), TimeSpan.FromHours(2));

    private static async Task<Activity> Run(RemindersFactory factory, Guid runner)
    {
        var now = factory.Time.GetUtcNow();
        var recording = new ActivityRecording(now.AddMinutes(-30), ActivityKind.Run,
            [new(TimeSpan.Zero, 0), new(TimeSpan.FromMinutes(25), 5000)], DeviceTotals.None);
        var run = Activity.Record(runner, recording, DateOnly.FromDateTime(now.AddHours(2).DateTime), [], ActivityOrigin.Strava(1, now, false));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        db.Activities.Add(run);
        await db.SaveChangesAsync();
        return run;
    }

    private static async Task Celebrate(RemindersFactory factory, Activity run)
    {
        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<RunCelebrator>().OfferAsync(run, CancellationToken.None);
    }

    [Fact]
    public async Task Preferences_survive_reload_and_old_client_updates_without_reenabling_opted_out_types()
    {
        await using var factory = new RemindersFactory();
        var selected = Choices(congratulations: false, longRun: true, connection: true, quietStart: new(22, 0), quietEnd: new(6, 0))
            with
        { PreparationAt = TimeOnly.MinValue };
        var device = await Device(factory, selected);
        await device.Client.TurnOn(device.Endpoint, "07:15:00"); // Older clients omit preferences.
        var json = (await device.Client.Reminders()).GetProperty("devices").EnumerateArray().Single().GetProperty("preferences");
        json.GetProperty("runCongratulations").GetBoolean().ShouldBeFalse();
        json.GetProperty("longRunPreparation").GetBoolean().ShouldBeTrue();
        json.GetProperty("connectionAlerts").GetBoolean().ShouldBeTrue();
        json.GetProperty("preparationAt").GetString().ShouldBe("00:00:00");
        json.GetProperty("quietStart").GetString().ShouldBe("22:00:00");
    }

    [Fact]
    public async Task Invalid_quiet_hours_do_not_replace_saved_preferences()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices());
        var body = JsonSerializer.SerializeToElement(RemindersFactory.Subscription(device.Endpoint)).EnumerateObject().ToDictionary(p => p.Name, p => (object)p.Value);
        body["preferences"] = Choices(quietStart: new(22, 0));
        (await device.Client.PutAsJsonAsync(ReminderClients.Url("/api/v1/me/reminders/devices"), body)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var json = (await device.Client.Reminders()).GetProperty("devices").EnumerateArray().Single().GetProperty("preferences");
        json.GetProperty("quietStart").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task Morning_reminders_wait_for_quiet_hours_to_end_and_send_only_once()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices(quietStart: new(5, 0), quietEnd: new(8, 0)));
        var plan = await ReminderSendingTests.SavePlan(device.Client);
        await Configure(device.Client, device.Endpoint, Choices(quietStart: new(5, 0), quietEnd: new(8, 0)), "06:00:00", true);
        var day = plan.Runs[0].Date;
        factory.Time.SetUtcNow(At(day, 6));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).ShouldBeEmpty();
        factory.Time.SetUtcNow(At(day, 8));
        await ReminderSendingTests.RunDue(factory);
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Preparation_is_sent_the_evening_before_and_is_deduplicated(bool race)
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices(longRun: !race, race: race));
        var saved = await ReminderSendingTests.SavePlan(device.Client);
        var date = race ? new DateOnly(2026, 12, 20) : saved.Runs.First(r => r.Type.StartsWith("LongRun", StringComparison.Ordinal)).Date;
        factory.Time.SetUtcNow(At(date.AddDays(-1), 17, 59));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).ShouldBeEmpty();
        factory.Time.SetUtcNow(At(date.AddDays(-1), 18));
        await ReminderSendingTests.RunDue(factory);
        await ReminderSendingTests.RunDue(factory);
        var message = factory.Push.To(device.Endpoint).Single();
        message.Title.ShouldBe(race ? "Race day is tomorrow" : "Prepare for tomorrow’s long run");
        message.Url.ShouldContain(race ? "prepare=race" : "prepare=long");
        message.Url.ShouldContain(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        message.Tag.Length.ShouldBeLessThanOrEqualTo(32);
    }

    [Fact]
    public async Task Quiet_congratulations_are_deferred_per_device_and_an_awake_device_gets_its_own_push()
    {
        await using var factory = new RemindersFactory();
        factory.Time.SetUtcNow(At(new(2026, 10, 8), 23));
        var quiet = await Device(factory, Choices(quietStart: new(22, 0), quietEnd: new(6, 0)));
        var awake = RemindersFactory.NewEndpoint();
        await Configure(quiet.Client, awake, Choices());
        var run = await Run(factory, quiet.Runner);
        await Celebrate(factory, run);
        factory.Push.To(quiet.Endpoint).ShouldBeEmpty();
        factory.Push.To(awake).Count.ShouldBe(1);
        factory.Time.SetUtcNow(At(new(2026, 10, 9), 6));
        await ReminderSendingTests.RunDue(factory);
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(quiet.Endpoint).Count.ShouldBe(1);
        factory.Push.To(quiet.Endpoint).Single().Url.ShouldContain(run.Id.ToString());
        factory.Push.To(awake).Count.ShouldBe(1);
    }

    [Fact]
    public async Task Disabling_a_category_cancels_its_pending_alert()
    {
        await using var factory = new RemindersFactory();
        factory.Time.SetUtcNow(At(new(2026, 10, 8), 23));
        var device = await Device(factory, Choices(quietStart: new(22, 0), quietEnd: new(6, 0)));
        var run = await Run(factory, device.Runner);
        await Celebrate(factory, run);
        await Configure(device.Client, device.Endpoint, Choices(congratulations: false));
        factory.Time.SetUtcNow(At(new(2026, 10, 9), 6));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).ShouldBeEmpty();
    }

    [Fact]
    public async Task A_repeated_DST_hour_does_not_delay_a_push_when_quiet_hours_are_off()
    {
        await using var factory = new RemindersFactory();
        factory.Time.SetUtcNow(new(2026, 11, 1, 5, 30, 0, TimeSpan.Zero));
        var device = await Device(factory, Choices(), "America/New_York");
        await Celebrate(factory, await Run(factory, device.Runner));
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
    }

    [Fact]
    public async Task A_scheduled_reminder_uses_the_later_occurrence_of_a_repeated_local_time()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices(), "America/New_York");
        await ReminderSendingTests.SavePlan(device.Client);
        await Configure(device.Client, device.Endpoint, Choices(), "01:30:00");
        factory.Time.SetUtcNow(new(2026, 11, 1, 5, 30, 0, TimeSpan.Zero));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).ShouldBeEmpty();
        factory.Time.SetUtcNow(new(2026, 11, 1, 6, 30, 0, TimeSpan.Zero));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
    }

    [Fact]
    public async Task A_skipped_local_time_is_shifted_forward_without_an_early_send_or_immediate_retry_loop()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices(quietStart: new(1, 0), quietEnd: new(3, 0)), "America/New_York");
        (await device.Client.PostAsJsonAsync(ReminderClients.Url("/api/v1/me/plans"), new
        {
            plan = new
            {
                raceName = "DST 10K",
                distanceKm = 10,
                raceDate = "2027-04-18",
                goalTime = "00:50:00",
                runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
                longRunDay = "Sunday",
                currentWeeklyKm = 25,
            }
        })).EnsureSuccessStatusCode();
        await Configure(device.Client, device.Endpoint, Choices(quietStart: new(1, 0), quietEnd: new(3, 0)), "02:30:00");
        factory.Time.SetUtcNow(new(2027, 3, 14, 7, 15, 0, TimeSpan.Zero));
        var next = await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).ShouldBeEmpty();
        next.ShouldNotBeNull();
        next.Value.ShouldBeGreaterThan(factory.Time.GetUtcNow());
        factory.Time.SetUtcNow(new(2027, 3, 14, 7, 30, 0, TimeSpan.Zero));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
    }

    [Fact]
    public async Task Normal_clock_progress_during_database_work_does_not_defer_an_immediate_push()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices());
        var run = await Run(factory, device.Runner);
        factory.Time.AutoAdvanceAmount = TimeSpan.FromMilliseconds(1);
        await Celebrate(factory, run);
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
    }

    [Fact]
    public async Task Export_is_scoped_to_the_runner_and_deletion_removes_pending_deliveries()
    {
        await using var factory = new RemindersFactory();
        factory.Time.SetUtcNow(At(new(2026, 10, 8), 23));
        var first = await Device(factory, Choices(quietStart: new(22, 0), quietEnd: new(6, 0)));
        var second = await Device(factory, Choices(quietStart: new(22, 0), quietEnd: new(6, 0)));
        var run = await Run(factory, first.Runner);
        await Celebrate(factory, run);
        var otherRun = await Run(factory, second.Runner);
        await Celebrate(factory, otherRun);
        var export = await first.Client.GetFromJsonAsync<JsonElement>(ReminderClients.Url("/api/v1/me/export"));
        var history = export.GetProperty("notificationHistory").EnumerateArray().ToList();
        history.Single().GetProperty("subjectId").GetGuid().ShouldBe(run.Id);
        export.GetRawText().ShouldNotContain(first.Endpoint);
        export.GetRawText().ShouldNotContain(otherRun.Id.ToString());
        (await first.Client.DeleteAsync(ReminderClients.Url("/api/v1/me"))).EnsureSuccessStatusCode();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.NotificationDeliveries.AnyAsync(d => d.SubjectId == run.Id)).ShouldBeFalse();
        (await db.NotificationDeliveries.AnyAsync(d => d.SubjectId == otherRun.Id)).ShouldBeTrue();
    }

    [Fact]
    public async Task A_removed_plan_cancels_its_quiet_hour_preparation_alert()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices(longRun: true, quietStart: new(17, 0), quietEnd: new(19, 0)));
        var saved = await ReminderSendingTests.SavePlan(device.Client);
        var target = saved.Runs.First(r => r.Type.StartsWith("LongRun", StringComparison.Ordinal)).Date;
        factory.Time.SetUtcNow(At(target.AddDays(-1), 18));
        await ReminderSendingTests.RunDue(factory);
        (await device.Client.DeleteAsync(ReminderClients.Url($"/api/v1/me/plans/{saved.Id}"))).EnsureSuccessStatusCode();
        factory.Time.SetUtcNow(At(target.AddDays(-1), 19));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).ShouldBeEmpty();
    }

    [Fact]
    public async Task Connection_alerts_are_once_per_reconnect_episode_and_cancel_when_fixed_during_quiet_hours()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices(connection: true));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var connection = ProviderConnection.Connect(device.Runner, SyncProvider.Strava, Random.Shared.NextInt64(1, long.MaxValue), "read", new("protected-access", "protected-refresh", factory.Time.GetUtcNow().AddHours(1)), factory.Time.GetUtcNow());
        db.ProviderConnections.Add(connection);
        connection.RequireReconnect();
        await db.SaveChangesAsync();
        await ReminderSendingTests.RunDue(factory);
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
        factory.Push.To(device.Endpoint).Single().Url.ShouldContain("settings=connections");

        connection.UpdateTokens(new("new-protected-access", "new-protected-refresh", factory.Time.GetUtcNow().AddHours(2)));
        await db.SaveChangesAsync();
        factory.Time.SetUtcNow(At(new(2026, 10, 8), 23));
        await Configure(device.Client, device.Endpoint, Choices(connection: true, quietStart: new(22, 0), quietEnd: new(6, 0)));
        connection.RequireReconnect();
        await db.SaveChangesAsync();
        await ReminderSendingTests.RunDue(factory);
        connection.UpdateTokens(new("fixed-access", "fixed-refresh", factory.Time.GetUtcNow().AddHours(2)));
        await db.SaveChangesAsync();
        factory.Time.SetUtcNow(At(new(2026, 10, 9), 6));
        await ReminderSendingTests.RunDue(factory);
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
    }

    [Fact]
    public async Task Concurrent_delivery_passes_and_queue_attempts_do_not_duplicate_a_push()
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices());
        var run = await Run(factory, device.Runner);
        var id = (await device.Client.Reminders()).GetProperty("devices").EnumerateArray().Single().GetProperty("id").GetGuid();
        async Task Queue()
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            var subscription = await db.PushSubscriptions.SingleAsync(d => d.Id == id);
            await scope.ServiceProvider.GetRequiredService<NotificationDeliverer>().QueueAsync(subscription, NotificationKind.RunCongratulations,
                run.Id, run.Id.ToString("N"), factory.Time.GetUtcNow(), factory.Time.GetUtcNow().AddHours(1), CancellationToken.None);
        }
        async Task Flush()
        {
            using var scope = factory.Services.CreateScope();
            await scope.ServiceProvider.GetRequiredService<NotificationDeliverer>().FlushAsync(CancellationToken.None, id);
        }
        await Task.WhenAll(Queue(), Queue());
        await Task.WhenAll(Flush(), Flush());
        factory.Push.To(device.Endpoint).Count.ShouldBe(1);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Reviews_are_not_applied_by_notifications_and_an_accepted_quiet_hour_review_is_cancelled(bool acceptDuringQuiet)
    {
        await using var factory = new RemindersFactory();
        var device = await Device(factory, Choices(reviews: true));
        var saved = await ReminderSendingTests.SavePlan(device.Client);
        var monday = saved.Weeks[1];
        factory.Time.SetUtcNow(At(monday.AddDays(-1), 21));
        foreach (var run in saved.Runs.Where(r => r.Date < monday))
            (await device.Client.PutAsJsonAsync(ReminderClients.Url($"/api/v1/me/plans/{saved.Id}/check-ins/{run.Date:yyyy-MM-dd}/{run.Type}"),
                new { status = "Done", effort = 9 })).EnsureSuccessStatusCode();
        var preferences = acceptDuringQuiet ? Choices(reviews: true, quietStart: new(5, 0), quietEnd: new(8, 0)) : Choices(reviews: true);
        await Configure(device.Client, device.Endpoint, preferences, "06:00:00");
        factory.Time.SetUtcNow(At(monday, 6));
        await ReminderSendingTests.RunDue(factory);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.CoachWeeks.CountAsync(c => c.SavedPlanId == saved.Id)).ShouldBe(0);
        if (acceptDuringQuiet)
        {
            factory.Push.To(device.Endpoint).ShouldBeEmpty();
            var preview = await device.Client.GetFromJsonAsync<JsonElement>(ReminderClients.Url($"/api/v1/me/plans/{saved.Id}/coach/proposal"));
            (await device.Client.PostAsJsonAsync(ReminderClients.Url($"/api/v1/me/plans/{saved.Id}/coach/apply"),
                new { token = preview.GetProperty("token").GetString() })).EnsureSuccessStatusCode();
            factory.Time.SetUtcNow(At(monday, 8));
            await ReminderSendingTests.RunDue(factory);
            factory.Push.To(device.Endpoint).ShouldBeEmpty();
        }
        else
        {
            await ReminderSendingTests.RunDue(factory);
            var message = factory.Push.To(device.Endpoint).Single();
            message.Title.ShouldBe("Training adjustment ready to review");
            message.Url.ShouldContain("review=1");
            (await db.CoachWeeks.CountAsync(c => c.SavedPlanId == saved.Id)).ShouldBe(0);
        }
    }
}
