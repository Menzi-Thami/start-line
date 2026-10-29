using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using StartLine.Domain.Activities;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Push;
using StartLine.Infrastructure.Sync;

namespace StartLine.Integration.Tests;

public sealed class AutomaticRunningTotalsTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 29, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Yesterday = new(2026, 10, 28);
    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<(HttpClient Client, Guid Runner, Guid Plan)> Ready(AutomaticTotalsFactory factory)
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        var profile = await client.PutAsJsonAsync(Url("/api/v1/me"), new { displayName = "Totals QA", timeZone = "Africa/Johannesburg", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true });
        profile.EnsureSuccessStatusCode();
        var runner = JsonDocument.Parse(await profile.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        var saved = await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = new { raceName = "Totals 10K", distanceKm = 10, raceDate = "2026-12-13", goalTime = "00:52:00", runDays = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" }, longRunDay = "Sunday", currentWeeklyKm = 25, planFrom = "2026-10-08" } });
        saved.EnsureSuccessStatusCode();
        var plan = JsonDocument.Parse(await saved.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        factory.Time.SetUtcNow(Now);
        return (client, runner, plan);
    }

    private static async Task<Activity> Run(AutomaticTotalsFactory factory, Guid runner, double km = 10, int hour = 6, ActivityOrigin? origin = null)
    {
        var recording = new ActivityRecording(new DateTimeOffset(2026, 10, 28, hour, 0, 0, TimeSpan.Zero), ActivityKind.Run,
            [new(TimeSpan.Zero, 0), new(TimeSpan.FromMinutes(70), km * 1000)], DeviceTotals.None);
        var activity = Activity.Record(runner, recording, Yesterday, [], origin ?? ActivityOrigin.Strava(hour, Now, false));
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        db.Activities.Add(activity);
        await db.SaveChangesAsync();
        return activity;
    }

    private static async Task<JsonElement[]> Totals(HttpClient client, bool synced = true)
    {
        var response = await client.GetAsync(Url("/api/v1/me/running" + (synced ? "?includeSynced=true" : "")));
        response.EnsureSuccessStatusCode();
        response.Headers.CacheControl!.NoStore.ShouldBeTrue();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.EnumerateArray().ToArray();
    }

    private static async Task Link(HttpClient client, Guid plan, Guid activity, double? ownKm = null)
    {
        var response = await client.PutAsJsonAsync(Url(string.Create(CultureInfo.InvariantCulture, $"/api/v1/me/plans/{plan}/check-ins/additional/{Guid.NewGuid()}/{Yesterday:yyyy-MM-dd}/Easy")),
            new { status = "Done", activityId = activity, distanceKm = ownKm, distanceUnreported = ownKm is null, independentMetrics = ownKm is not null });
        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_synced_rest_day_run_counts_before_and_after_logging_without_copying_its_distance()
    {
        await using var factory = new AutomaticTotalsFactory();
        var (client, runner, plan) = await Ready(factory);
        var activity = await Run(factory, runner);
        (await Totals(client)).ShouldHaveSingleItem().GetProperty("distanceKm").GetDouble().ShouldBe(10);
        (await Totals(client, synced: false)).ShouldBeEmpty();
        var before = JsonDocument.Parse(await client.GetStringAsync(Url($"/api/v1/me/plans/{plan}/check-ins"))).RootElement;
        before.GetArrayLength().ShouldBe(0);
        await Link(client, plan, activity.Id);
        var linked = (await Totals(client)).ShouldHaveSingleItem();
        linked.GetProperty("source").GetString().ShouldBe("Strava");
        linked.GetProperty("distanceKm").GetDouble().ShouldBe(10);
        using var scope = factory.Services.CreateScope();
        var entry = await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().SessionCheckIns.SingleAsync(c => c.SavedPlanId == plan);
        entry.DistanceKm.ShouldBeNull();
        entry.DistanceUnreported.ShouldBeTrue();
    }

    [Fact]
    public async Task Independently_entered_distance_is_counted_once_and_survives_cache_expiry()
    {
        await using var factory = new AutomaticTotalsFactory();
        var (client, runner, plan) = await Ready(factory);
        var activity = await Run(factory, runner);
        await Link(client, plan, activity.Id, 12);
        (await Totals(client)).ShouldHaveSingleItem().GetProperty("distanceKm").GetDouble().ShouldBe(12);
        factory.Time.Advance(TimeSpan.FromDays(8));
        var retained = (await Totals(client)).ShouldHaveSingleItem();
        retained.GetProperty("distanceKm").GetDouble().ShouldBe(12);
        retained.GetProperty("source").GetString().ShouldBe("Ticked");
    }

    [Fact]
    public async Task Expired_imports_are_excluded_even_before_cleanup_and_the_saved_completion_remains_unknown()
    {
        await using var factory = new AutomaticTotalsFactory();
        var (client, runner, plan) = await Ready(factory);
        var activity = await Run(factory, runner);
        await Link(client, plan, activity.Id);
        factory.Time.Advance(TimeSpan.FromDays(7));
        var retained = (await Totals(client)).ShouldHaveSingleItem();
        retained.GetProperty("distanceUnreported").GetBoolean().ShouldBeTrue();
        retained.GetProperty("source").GetString().ShouldBe("Ticked");
        using var scope = factory.Services.CreateScope();
        (await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().Activities.AnyAsync(a => a.Id == activity.Id)).ShouldBeTrue();
    }

    [Fact]
    public async Task Distinct_runs_on_one_day_count_separately_and_other_accounts_are_excluded()
    {
        await using var factory = new AutomaticTotalsFactory();
        var (client, runner, _) = await Ready(factory);
        await Run(factory, runner); await Run(factory, runner, 3, hour: 9, origin: ActivityOrigin.Upload);
        var (_, other, _) = await Ready(factory); await Run(factory, other, 99);
        var result = await Totals(client);
        result.Length.ShouldBe(2);
        result.Sum(r => r.GetProperty("distanceKm").GetDouble()).ShouldBe(13);
    }

    [Fact]
    public async Task Synced_distance_also_counts_without_a_saved_plan()
    {
        await using var factory = new AutomaticTotalsFactory();
        var (client, runner, plan) = await Ready(factory);
        await Run(factory, runner);
        (await client.DeleteAsync(Url($"/api/v1/me/plans/{plan}"))).EnsureSuccessStatusCode();
        (await Totals(client)).ShouldHaveSingleItem().GetProperty("distanceKm").GetDouble().ShouldBe(10);
    }
}

public sealed class AutomaticTotalsFactory : StartLineApiFactory
{
    protected override void ConfigureServices(IServiceCollection services)
    {
        foreach (var worker in services.Where(d => d.ServiceType == typeof(IHostedService) && (d.ImplementationType == typeof(StravaSyncWorker) || d.ImplementationType == typeof(ReminderWorker))).ToList())
        {
            services.Remove(worker);
        }
    }
}
