using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Push;

namespace StartLine.Integration.Tests;

[Collection(RemindersInSeries.Name)]
public sealed class PushTestScheduleTests
{
    private static async Task<(HttpClient Client, string Email, string Endpoint)> Device(RemindersFactory factory, string? email = null)
    {
        email ??= $"{Guid.NewGuid():N}@example.test";
        var client = factory.CreateClient().As(Guid.NewGuid().ToString(), email);
        (await client.PutAsJsonAsync(ReminderClients.Url("/api/v1/me"), new
        {
            displayName = "Push diagnostic",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        })).EnsureSuccessStatusCode();
        var endpoint = RemindersFactory.NewEndpoint();
        (await client.TurnOn(endpoint)).EnsureSuccessStatusCode();
        return (client, email, endpoint);
    }

    private static async Task<DateTimeOffset?> Run(RemindersFactory factory, string email, DateTimeOffset first)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<PushTestRunner>().RunDueAsync(email, first, CancellationToken.None);
    }

    [Fact]
    public async Task Exactly_two_slots_one_hour_apart_only_target_opted_in_devices_without_a_plan()
    {
        await using var factory = new RemindersFactory();
        var target = await Device(factory);
        var other = await Device(factory);
        var first = factory.Time.GetUtcNow().AddHours(1);
        (await Run(factory, target.Email, first)).ShouldBe(first);
        factory.Push.To(target.Endpoint).ShouldBeEmpty();

        factory.Time.Advance(TimeSpan.FromHours(1));
        (await Run(factory, target.Email, first)).ShouldBe(first.AddHours(1));
        await Run(factory, target.Email, first);
        factory.Push.To(target.Endpoint).Count.ShouldBe(1);
        factory.Push.To(target.Endpoint)[0].Body.ShouldContain("Test 1 of 2");

        factory.Time.Advance(TimeSpan.FromHours(1));
        (await Run(factory, target.Email, first)).ShouldBeNull();
        await Run(factory, target.Email, first);
        factory.Push.To(target.Endpoint).Count.ShouldBe(2);
        factory.Push.To(target.Endpoint)[1].Body.ShouldContain("Test 2 of 2");
        factory.Push.To(other.Endpoint).ShouldBeEmpty();
        factory.Time.Advance(TimeSpan.FromDays(1));
        (await Run(factory, target.Email, first)).ShouldBeNull();
        factory.Push.To(target.Endpoint).Count.ShouldBe(2);
    }

    [Fact]
    public async Task Overlapping_instances_claim_the_slot_only_once_and_leave_daily_preferences_unchanged()
    {
        await using var factory = new RemindersFactory();
        var target = await Device(factory);
        var first = factory.Time.GetUtcNow();
        using var before = factory.Services.CreateScope();
        var db = before.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var device = await db.PushSubscriptions.SingleAsync(d => d.DeviceKey == ReminderClients.KeyOf(target.Endpoint));
        var dailyMarker = device.LastRemindedOn;

        await Task.WhenAll(Run(factory, target.Email, first), Run(factory, target.Email, first));
        factory.Push.To(target.Endpoint).Count.ShouldBe(1);
        await db.Entry(device).ReloadAsync();
        device.LastTestPushAt.ShouldBe(first);
        device.LastRemindedOn.ShouldBe(dailyMarker);
        device.RemindAt.ShouldBe(new TimeOnly(7, 0));
    }

    [Fact]
    public async Task Sleep_skips_a_stale_first_slot_and_sends_only_the_due_second_slot()
    {
        await using var factory = new RemindersFactory();
        var target = await Device(factory);
        var first = factory.Time.GetUtcNow();
        factory.Time.Advance(TimeSpan.FromHours(1));
        (await Run(factory, target.Email, first)).ShouldBeNull();
        factory.Push.To(target.Endpoint).Single().Body.ShouldContain("Test 2 of 2");
    }

    [Fact]
    public async Task Fully_expired_tests_send_nothing()
    {
        await using var factory = new RemindersFactory();
        var target = await Device(factory);
        (await Run(factory, target.Email, factory.Time.GetUtcNow().AddHours(-2))).ShouldBeNull();
        factory.Push.To(target.Endpoint).ShouldBeEmpty();
    }

    [Fact]
    public async Task Ambiguous_or_missing_accounts_are_never_notified()
    {
        await using var factory = new RemindersFactory();
        var first = await Device(factory);
        var second = await Device(factory, first.Email);
        await Run(factory, first.Email, factory.Time.GetUtcNow());
        await Run(factory, $"{Guid.NewGuid():N}@missing.test", factory.Time.GetUtcNow());
        factory.Push.To(first.Endpoint).ShouldBeEmpty();
        factory.Push.To(second.Endpoint).ShouldBeEmpty();
    }

    [Fact]
    public async Task Unsubscribed_devices_are_removed_and_receive_no_second_push()
    {
        await using var factory = new RemindersFactory();
        var target = await Device(factory);
        factory.Push.Gone[target.Endpoint] = true;
        var first = factory.Time.GetUtcNow();
        await Run(factory, target.Email, first);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        (await db.PushSubscriptions.AnyAsync(d => d.DeviceKey == ReminderClients.KeyOf(target.Endpoint))).ShouldBeFalse();
        factory.Time.Advance(TimeSpan.FromHours(1));
        await Run(factory, target.Email, first);
        factory.Push.To(target.Endpoint).ShouldBeEmpty();
    }

    [Theory]
    [InlineData("", false, true)]
    [InlineData("runner@example.test", true, true)]
    [InlineData("", true, false)]
    [InlineData("runner@example.test", false, false)]
    [InlineData("not-an-email", true, false)]
    public void Configuration_requires_both_a_valid_target_and_absolute_slot_or_is_disabled(string email, bool hasSlot, bool valid)
    {
        var options = new PushTestOptions { TargetEmail = email, FirstAt = hasSlot ? StartLineApiFactory.Now : null };
        new PushTestOptionsValidator().Validate(null, options).Succeeded.ShouldBe(valid);
    }
}
