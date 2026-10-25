using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Notifications;
using StartLine.Domain.Notifications;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

internal static class ReminderClients
{
    public static Uri Url(string path) => new(path, UriKind.Relative);

    public static async Task<JsonElement> Json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    public static async Task<HttpClient> SignedUp(this StartLineApiFactory factory, string timeZone = "Africa/Johannesburg")
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        var profile = new { displayName = "Lindiwe", timeZone, units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true };
        (await client.PutAsJsonAsync(Url("/api/v1/me"), profile)).EnsureSuccessStatusCode();
        return client;
    }

    public static Task<HttpResponseMessage> TurnOn(this HttpClient client, string endpoint, string remindAt = "07:00:00", bool weekAhead = false) =>
        client.PutAsJsonAsync(Url("/api/v1/me/reminders/devices"), RemindersFactory.Subscription(endpoint, remindAt, weekAhead));

    public static async Task<JsonElement> Reminders(this HttpClient client) =>
        await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me/reminders"));

    public static string KeyOf(string endpoint) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(endpoint)));
}

/// <summary>Turning reminders on and off from Account, and what's kept while they're on.</summary>
public sealed class ReminderApiTests(RemindersFactory factory) : IClassFixture<RemindersFactory>
{
    private static Uri Url(string path) => ReminderClients.Url(path);

    private async Task<List<PushSubscription>> StoredFor(HttpClient client)
    {
        var id = (await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me"))).GetProperty("id").GetGuid();
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().PushSubscriptions.AsNoTracking()
            .Where(s => s.RunnerId == id).ToListAsync();
    }

    [Fact]
    public async Task Reminders_are_off_until_the_runner_turns_them_on()
    {
        var client = await factory.SignedUp();

        var reminders = await client.Reminders();

        reminders.GetProperty("available").GetBoolean().ShouldBeTrue();
        reminders.GetProperty("publicKey").GetString().ShouldNotBeNullOrEmpty();
        reminders.GetProperty("devices").GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task Turning_on_keeps_the_device_and_its_time_and_turning_off_forgets_it()
    {
        var client = await factory.SignedUp();
        var endpoint = RemindersFactory.NewEndpoint();

        var on = await client.TurnOn(endpoint, "06:15:00", weekAhead: true);

        on.StatusCode.ShouldBe(HttpStatusCode.OK);
        var device = await ReminderClients.Json(on);
        device.GetProperty("deviceKey").GetString().ShouldBe(ReminderClients.KeyOf(endpoint));
        device.GetProperty("remindAt").GetString().ShouldBe("06:15:00");
        device.GetProperty("weekAhead").GetBoolean().ShouldBeTrue();
        device.TryGetProperty("endpoint", out _).ShouldBeFalse();
        var listed = (await client.Reminders()).GetProperty("devices");
        listed.GetArrayLength().ShouldBe(1);
        listed[0].GetProperty("id").GetGuid().ShouldBe(device.GetProperty("id").GetGuid());

        var off = await client.DeleteAsync(Url($"/api/v1/me/reminders/devices/{device.GetProperty("id").GetGuid()}"));

        off.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.Reminders()).GetProperty("devices").GetArrayLength().ShouldBe(0);
        (await StoredFor(client)).ShouldBeEmpty();
        // Safe to repeat.
        (await client.DeleteAsync(Url($"/api/v1/me/reminders/devices/{device.GetProperty("id").GetGuid()}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task The_push_address_is_stored_encrypted()
    {
        var client = await factory.SignedUp();
        var endpoint = RemindersFactory.NewEndpoint();
        await client.TurnOn(endpoint);

        var stored = (await StoredFor(client)).ShouldHaveSingleItem();

        stored.Endpoint.ShouldNotContain("fcm.googleapis.com");
        stored.Endpoint.ShouldNotContain(endpoint.Split('/')[^1]);
        stored.Auth.ShouldNotBe(Convert.ToBase64String(new byte[16]).TrimEnd('='));
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<IPushAddressProtector>().Unprotect(stored.Endpoint).ShouldBe(endpoint);
    }

    [Fact]
    public async Task The_same_device_again_changes_its_time_rather_than_adding_another()
    {
        var client = await factory.SignedUp();
        var endpoint = RemindersFactory.NewEndpoint();
        var first = await ReminderClients.Json(await client.TurnOn(endpoint, "07:00:00"));

        var second = await ReminderClients.Json(await client.TurnOn(endpoint, "05:45:00"));

        second.GetProperty("id").GetGuid().ShouldBe(first.GetProperty("id").GetGuid());
        var devices = (await client.Reminders()).GetProperty("devices");
        devices.GetArrayLength().ShouldBe(1);
        devices[0].GetProperty("remindAt").GetString().ShouldBe("05:45:00");
    }

    [Fact]
    public async Task A_device_moves_to_whoever_signs_in_on_it()
    {
        var first = await factory.SignedUp();
        var second = await factory.SignedUp();
        var endpoint = RemindersFactory.NewEndpoint();
        await first.TurnOn(endpoint);

        (await second.TurnOn(endpoint)).StatusCode.ShouldBe(HttpStatusCode.OK);

        (await first.Reminders()).GetProperty("devices").GetArrayLength().ShouldBe(0);
        (await second.Reminders()).GetProperty("devices").GetArrayLength().ShouldBe(1);
    }

    [Fact]
    public async Task Another_runner_cannot_turn_off_someone_elses_reminders()
    {
        var owner = await factory.SignedUp();
        var other = await factory.SignedUp();
        var id = (await ReminderClients.Json(await owner.TurnOn(RemindersFactory.NewEndpoint()))).GetProperty("id").GetGuid();

        (await other.DeleteAsync(Url($"/api/v1/me/reminders/devices/{id}"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await owner.Reminders()).GetProperty("devices").GetArrayLength().ShouldBe(1);
    }

    [Theory]
    [InlineData("https://example.com/push/abc")]
    [InlineData("http://fcm.googleapis.com/fcm/send/abc")]
    [InlineData("https://localhost/fcm/send/abc")]
    public async Task Only_a_browsers_push_service_is_accepted(string endpoint)
    {
        var client = await factory.SignedUp();

        var response = await client.TurnOn(endpoint);

        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await ReminderClients.Json(response)).GetProperty("errors").TryGetProperty("Endpoint", out _).ShouldBeTrue();
    }

    [Fact]
    public async Task Turning_on_needs_a_finished_sign_up()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());

        var response = await client.TurnOn(RemindersFactory.NewEndpoint());

        response.StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await ReminderClients.Json(response)).GetProperty("code").GetString().ShouldBe("registration_required");
    }

    [Fact]
    public async Task Anonymous_callers_cannot_turn_reminders_on()
    {
        var response = await factory.CreateClient().PutAsJsonAsync(Url("/api/v1/me/reminders/devices"), RemindersFactory.Subscription(RemindersFactory.NewEndpoint()));

        response.StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_export_lists_devices_with_reminders_but_never_their_push_address()
    {
        var client = await factory.SignedUp();
        var endpoint = RemindersFactory.NewEndpoint();
        await client.TurnOn(endpoint, "06:30:00");

        var raw = await client.GetStringAsync(Url("/api/v1/me/export"));

        var reminders = JsonDocument.Parse(raw).RootElement.GetProperty("reminders");
        reminders.GetArrayLength().ShouldBe(1);
        reminders[0].GetProperty("remindAt").GetString().ShouldBe("06:30:00");
        raw.ShouldNotContain(endpoint.Split('/')[^1]);
    }

    [Fact]
    public async Task Deleting_the_account_removes_its_reminders()
    {
        var client = await factory.SignedUp();
        await client.TurnOn(RemindersFactory.NewEndpoint());
        var id = (await client.GetFromJsonAsync<JsonElement>(Url("/api/v1/me"))).GetProperty("id").GetGuid();

        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        using var scope = factory.Services.CreateScope();
        (await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().PushSubscriptions.AnyAsync(s => s.RunnerId == id)).ShouldBeFalse();
    }
}

/// <summary>Without VAPID keys configured, reminders aren't offered and can't be turned on.</summary>
public sealed class RemindersSwitchedOffTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    [Fact]
    public async Task Reminders_are_not_offered_and_cannot_be_turned_on()
    {
        var client = await factory.SignedUp();

        var reminders = await client.Reminders();
        var response = await client.TurnOn(RemindersFactory.NewEndpoint());

        reminders.GetProperty("available").GetBoolean().ShouldBeFalse();
        reminders.GetProperty("publicKey").ValueKind.ShouldBe(JsonValueKind.Null);
        response.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await ReminderClients.Json(response)).GetProperty("code").GetString().ShouldBe("reminders_unavailable");
    }
}

/// <summary>
/// Sending: at each runner's own time, from the plan alone, once a day at most, and late rather than never when the app
/// slept. Each test has its own API and clock, because it moves the clock on.
/// </summary>
public sealed class ReminderSendingTests
{
    // A 10K on Sunday 20 December, saved on Thursday 8 October (the factory's clock), so the plan starts Monday 12 October.
    private static readonly object TenK = new
    {
        raceName = "Reminder 10K",
        distanceKm = 10,
        raceDate = "2026-12-20",
        goalTime = "00:50:00",
        runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        longRunDay = "Sunday",
        currentWeeklyKm = 25,
    };

    private static async Task<DateOnly> FirstRunDay(HttpClient client)
    {
        var saved = await client.PostAsJsonAsync(ReminderClients.Url("/api/v1/me/plans"), new { plan = TenK });
        saved.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await ReminderClients.Json(saved)).GetProperty("id").GetGuid();
        var plan = await client.GetFromJsonAsync<JsonElement>(ReminderClients.Url($"/api/v1/me/plans/{id}"));
        return plan.GetProperty("plan").GetProperty("weeks").EnumerateArray()
            .SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .Where(s => s.GetProperty("type").GetString() != "Strength")
            .Select(s => DateOnly.Parse(s.GetProperty("date").GetString()!, CultureInfo.InvariantCulture))
            .Min();
    }

    private static async Task<DateTimeOffset?> RunDue(RemindersFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IReminderRunner>().RunDueAsync(CancellationToken.None);
    }

    private static DateTimeOffset Utc(DateOnly day, int hour, int minute = 0) => new(day.ToDateTime(new TimeOnly(hour, minute)), TimeSpan.Zero);

    [Fact]
    public async Task Each_runner_hears_at_their_own_seven_oclock_once()
    {
        await using var factory = new RemindersFactory();
        var johannesburg = await factory.SignedUp("Africa/Johannesburg");
        var newYork = await factory.SignedUp("America/New_York");
        var day = await FirstRunDay(johannesburg);
        (await FirstRunDay(newYork)).ShouldBe(day);
        var jhb = RemindersFactory.NewEndpoint();
        var nyc = RemindersFactory.NewEndpoint();
        await johannesburg.TurnOn(jhb);
        await newYork.TurnOn(nyc);

        // Nothing until the run day.
        await RunDue(factory);
        factory.Push.To(jhb).ShouldBeEmpty();

        // 05:30 UTC: 07:30 in Johannesburg, 01:30 in New York.
        factory.Time.SetUtcNow(Utc(day, 5, 30));
        var next = await RunDue(factory);

        var sent = factory.Push.To(jhb).ShouldHaveSingleItem();
        sent.Title.ShouldBe(Reminders.RunTitle);
        sent.Url.ShouldBe("/?view=home");
        sent.Tag.ShouldBe($"reminder-{day:yyyy-MM-dd}");
        factory.Push.To(nyc).ShouldBeEmpty();
        // New York's is next: 07:00 Eastern Daylight Time is 11:00 UTC (other tests' devices may be due sooner).
        next.ShouldNotBeNull();
        next.Value.ShouldBeLessThanOrEqualTo(Utc(day, 11));

        // 11:30 UTC: New York's turn. Johannesburg's has gone already and never goes twice.
        factory.Time.SetUtcNow(Utc(day, 11, 30));
        await RunDue(factory);
        await RunDue(factory);

        factory.Push.To(jhb).Count.ShouldBe(1);
        factory.Push.To(nyc).ShouldHaveSingleItem().Title.ShouldBe(Reminders.RunTitle);
    }

    [Fact]
    public async Task A_reminder_missed_while_the_app_slept_goes_out_later_that_day()
    {
        await using var factory = new RemindersFactory();
        var client = await factory.SignedUp("Africa/Johannesburg");
        var day = await FirstRunDay(client);
        var endpoint = RemindersFactory.NewEndpoint();
        await client.TurnOn(endpoint, "06:00:00");

        // The app slept from 06:00 until 19:00 in Johannesburg (17:00 UTC).
        factory.Time.SetUtcNow(Utc(day, 17));
        await RunDue(factory);

        factory.Push.To(endpoint).ShouldHaveSingleItem();
    }

    [Fact]
    public async Task A_device_that_has_gone_from_its_push_service_is_forgotten()
    {
        await using var factory = new RemindersFactory();
        var client = await factory.SignedUp("Africa/Johannesburg");
        var day = await FirstRunDay(client);
        var endpoint = RemindersFactory.NewEndpoint();
        await client.TurnOn(endpoint);
        factory.Push.Gone[endpoint] = true;

        factory.Time.SetUtcNow(Utc(day, 6));
        await RunDue(factory);

        factory.Push.To(endpoint).ShouldBeEmpty();
        (await client.Reminders()).GetProperty("devices").GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task A_runner_with_no_plan_gets_nothing()
    {
        await using var factory = new RemindersFactory();
        var client = await factory.SignedUp("Africa/Johannesburg");
        var endpoint = RemindersFactory.NewEndpoint();
        await client.TurnOn(endpoint);

        factory.Time.SetUtcNow(Utc(new DateOnly(2026, 10, 13), 6));
        await RunDue(factory);

        factory.Push.To(endpoint).ShouldBeEmpty();
    }
}
