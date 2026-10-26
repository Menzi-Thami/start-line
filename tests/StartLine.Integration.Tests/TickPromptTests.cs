using System.Buffers.Text;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StartLine.Application.Features.Notifications;
using StartLine.Application.Features.Sync;
using StartLine.Infrastructure.Persistence;
using StartLine.Infrastructure.Push;
using StartLine.Infrastructure.Sync;

namespace StartLine.Integration.Tests;

/// <summary>
/// A run from Strava asks the runner to tick their session; the tick is theirs, and kept. Never a check-in made for them,
/// and never a Strava run in the coach's kept call. In series with the reminder tests: their sender works through every
/// device in the shared database.
/// </summary>
[Collection(RemindersInSeries.Name)]
public sealed class TickPromptTests
{
    // Sunday 18 October 2026, 07:00 in Johannesburg: the long run of week 1 of a plan that started on Monday 12 October.
    private static readonly DateTimeOffset SundayMorningRun = new(2026, 10, 18, 5, 0, 0, TimeSpan.Zero);

    private static readonly Dictionary<string, object?> TenK = new()
    {
        ["raceName"] = "Tick 10K",
        ["distanceKm"] = 10,
        ["raceDate"] = "2026-12-13",
        ["goalTime"] = "00:52:00",
        ["runDays"] = new[] { "Tuesday", "Thursday", "Saturday", "Sunday" },
        ["longRunDay"] = "Sunday",
        ["currentWeeklyKm"] = 25,
        ["planFrom"] = "2026-10-08",
    };

    private static long nextAthlete = 90_000;

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private static async Task<JsonElement> Json(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(body);
        return JsonDocument.Parse(body).RootElement;
    }

    private sealed record Runner(HttpClient Client, long Athlete, Guid Plan, List<(DateOnly Date, string Type)> Runs);

    /// <summary>Signs up, connects Strava, saves the 10K and, unless told not to, turns reminders on for one device.</summary>
    private static async Task<Runner> Ready(TickPromptFactory factory, string? endpoint)
    {
        var client = await factory.SignedUp();
        var athlete = Interlocked.Increment(ref nextAthlete);
        var authorize = await Json(await client.PostAsync(Url("/api/v1/me/sync/strava/authorize"), null));
        var state = Uri.UnescapeDataString(new Uri(authorize.GetProperty("authorizeUrl").GetString()!).Query.Split("state=")[1]);
        await Json(await client.PostAsJsonAsync(Url("/api/v1/me/sync/strava"), new { code = FakeStravaApi.CodeFor(athlete), state, scope = "read,activity:read_all" }));
        await factory.SyncAsync();

        var saved = await Json(await client.PostAsJsonAsync(Url("/api/v1/me/plans"), new { plan = TenK }));
        var id = saved.GetProperty("id").GetGuid();
        var weeks = (await Json(await client.GetAsync(Url($"/api/v1/me/plans/{id}")))).GetProperty("plan").GetProperty("weeks");
        var runs = weeks.EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .Select(s => (Date: DateOnly.Parse(s.GetProperty("date").GetString()!, CultureInfo.InvariantCulture), Type: s.GetProperty("type").GetString()!))
            .Where(s => s.Type is not ("Strength" or "Race"))
            .ToList();
        if (endpoint is not null)
        {
            (await client.TurnOn(endpoint)).EnsureSuccessStatusCode();
        }

        return new Runner(client, athlete, id, runs);
    }

    private static (DateOnly Date, string Type) Sunday(Runner runner) => runner.Runs.Single(r => r.Date == DateOnly.FromDateTime(SundayMorningRun.UtcDateTime));

    /// <summary>A run on Strava and its webhook, then the sync, as it happens for real.</summary>
    private static async Task<long> RunOnStrava(TickPromptFactory factory, Runner runner, DateTimeOffset start, double metres = 12_000)
    {
        var id = factory.Strava.AddRun(runner.Athlete, start, metres);
        await Hook(factory, runner, id, "create");
        return id;
    }

    private static async Task Hook(TickPromptFactory factory, Runner runner, long id, string aspect)
    {
        (await factory.CreateClient().PostAsJsonAsync(Url($"/api/v1/webhooks/strava/{StravaApiFactory.HookSecret}"), new Dictionary<string, object?>
        {
            ["object_type"] = "activity",
            ["object_id"] = id,
            ["aspect_type"] = aspect,
            ["owner_id"] = runner.Athlete,
            ["subscription_id"] = StravaApiFactory.SubscriptionId,
            ["event_time"] = factory.Time.GetUtcNow().ToUnixTimeSeconds(),
            ["updates"] = new { },
        })).StatusCode.ShouldBe(HttpStatusCode.OK);
        await factory.SyncAsync();
    }

    private static async Task<JsonElement> CheckIns(Runner runner) => await Json(await runner.Client.GetAsync(Url($"/api/v1/me/plans/{runner.Plan}/check-ins")));

    [Fact]
    public async Task A_synced_run_asks_once_to_tick_its_session_and_a_second_sync_asks_nothing()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var endpoint = RemindersFactory.NewEndpoint();
        var runner = await Ready(factory, endpoint);
        var (date, type) = Sunday(runner);

        var id = await RunOnStrava(factory, runner, SundayMorningRun);
        await Hook(factory, runner, id, "update");

        var asked = factory.Push.To(endpoint).ShouldHaveSingleItem();
        asked.Url.ShouldBe($"/?view=home&tick={date:yyyy-MM-dd}.{type}");
        asked.Title.ShouldStartWith("Ran Sunday’s ");
        asked.Tick.ShouldNotBeNullOrEmpty();
        // Run data isn't pushed unless Push:IncludeRunData is on.
        asked.Body.ShouldNotContain("km");
    }

    [Fact]
    public async Task With_run_data_allowed_the_prompt_says_how_far_strava_says_they_ran()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3)) { IncludeRunData = true };
        var endpoint = RemindersFactory.NewEndpoint();
        var runner = await Ready(factory, endpoint);

        await RunOnStrava(factory, runner, SundayMorningRun);

        factory.Push.To(endpoint).ShouldHaveSingleItem().Body.ShouldStartWith("Strava says you ran 12 km this morning.");
    }

    [Fact]
    public async Task What_it_keeps_is_the_session_it_asked_about_and_nothing_from_the_run()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var runner = await Ready(factory, RemindersFactory.NewEndpoint());
        var (date, type) = Sunday(runner);

        await RunOnStrava(factory, runner, SundayMorningRun);

        using var scope = factory.Services.CreateScope();
        var prompt = await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().TickPrompts.AsNoTracking()
            .SingleAsync(p => p.SavedPlanId == runner.Plan);
        (prompt.Date, prompt.SessionType.ToString()).ShouldBe((date, type));
    }

    [Fact]
    public async Task Tick_it_on_the_notification_records_a_plain_done_check_in_once()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var endpoint = RemindersFactory.NewEndpoint();
        var runner = await Ready(factory, endpoint);
        var (date, type) = Sunday(runner);
        await RunOnStrava(factory, runner, SundayMorningRun);
        var token = factory.Push.To(endpoint).Single().Tick!;

        // The service worker can't sign in: the key in the push is the only way in.
        var anonymous = factory.CreateClient();
        (await anonymous.PostAsJsonAsync(Url("/api/v1/ticks"), new { token })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await anonymous.PostAsJsonAsync(Url("/api/v1/ticks"), new { token })).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var checkIn = (await CheckIns(runner)).EnumerateArray().ShouldHaveSingleItem();
        checkIn.GetProperty("date").GetString().ShouldBe(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        checkIn.GetProperty("sessionType").GetString().ShouldBe(type);
        checkIn.GetProperty("status").GetString().ShouldBe("Done");
        checkIn.GetProperty("effort").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task A_tick_never_overwrites_what_the_runner_already_said()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var endpoint = RemindersFactory.NewEndpoint();
        var runner = await Ready(factory, endpoint);
        var (date, type) = Sunday(runner);
        await RunOnStrava(factory, runner, SundayMorningRun);
        (await runner.Client.PutAsJsonAsync(Url($"/api/v1/me/plans/{runner.Plan}/check-ins/{date:yyyy-MM-dd}/{type}"), new { status = "CutShort", effort = 8 }))
            .EnsureSuccessStatusCode();

        (await factory.CreateClient().PostAsJsonAsync(Url("/api/v1/ticks"), new { token = factory.Push.To(endpoint).Single().Tick }))
            .StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await CheckIns(runner)).EnumerateArray().ShouldHaveSingleItem().GetProperty("status").GetString().ShouldBe("CutShort");
    }

    [Fact]
    public async Task A_made_up_or_expired_key_ticks_nothing()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var endpoint = RemindersFactory.NewEndpoint();
        var runner = await Ready(factory, endpoint);
        await RunOnStrava(factory, runner, SundayMorningRun);
        var anonymous = factory.CreateClient();

        (await anonymous.PostAsJsonAsync(Url("/api/v1/ticks"), new { token = "not-a-key" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        factory.Time.Advance(TimeSpan.FromDays(4));
        (await anonymous.PostAsJsonAsync(Url("/api/v1/ticks"), new { token = factory.Push.To(endpoint).Single().Tick })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        (await CheckIns(runner)).GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task No_check_in_is_ever_made_without_the_runner_and_no_one_without_reminders_is_asked()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var endpoint = RemindersFactory.NewEndpoint();
        var withReminders = await Ready(factory, endpoint);
        var withoutReminders = await Ready(factory, endpoint: null);

        await RunOnStrava(factory, withReminders, SundayMorningRun);
        await RunOnStrava(factory, withoutReminders, SundayMorningRun);

        factory.Push.To(endpoint).Count.ShouldBe(1);
        factory.Push.Sent.Count.ShouldBe(1);
        (await CheckIns(withReminders)).GetArrayLength().ShouldBe(0);
        (await CheckIns(withoutReminders)).GetArrayLength().ShouldBe(0);
        (await Json(await withReminders.Client.GetAsync(Url("/api/v1/me/running")))).GetArrayLength().ShouldBe(0);
    }

    [Fact]
    public async Task A_run_from_a_backfill_or_already_ticked_asks_nothing()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var endpoint = RemindersFactory.NewEndpoint();
        var runner = await Ready(factory, endpoint);
        var thursday = runner.Runs.First(r => r.Date == new DateOnly(2026, 10, 15));
        var (date, type) = Sunday(runner);
        (await runner.Client.PutAsJsonAsync(Url($"/api/v1/me/plans/{runner.Plan}/check-ins/{date:yyyy-MM-dd}/{type}"), new { status = "Done" }))
            .EnsureSuccessStatusCode();

        await RunOnStrava(factory, runner, new DateTimeOffset(thursday.Date.ToDateTime(new TimeOnly(5, 0)), TimeSpan.Zero), metres: 6_000);
        await RunOnStrava(factory, runner, SundayMorningRun);

        factory.Push.To(endpoint).ShouldBeEmpty();
    }

    [Fact]
    public async Task Ticks_count_at_the_planned_distance_and_strava_runs_never_count_in_the_running_totals()
    {
        await using var factory = new TickPromptFactory(SundayMorningRun.AddHours(3));
        var runner = await Ready(factory, RemindersFactory.NewEndpoint());
        var (date, type) = Sunday(runner);
        await RunOnStrava(factory, runner, SundayMorningRun);
        var planned = (await Json(await runner.Client.GetAsync(Url($"/api/v1/me/plans/{runner.Plan}")))).GetProperty("plan").GetProperty("weeks")
            .EnumerateArray().SelectMany(w => w.GetProperty("sessions").EnumerateArray())
            .Single(s => s.GetProperty("date").GetString() == date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) && s.GetProperty("type").GetString() == type)
            .GetProperty("distanceKm").GetDouble();

        (await Json(await runner.Client.GetAsync(Url("/api/v1/me/running")))).GetArrayLength().ShouldBe(0);
        (await runner.Client.PutAsJsonAsync(Url($"/api/v1/me/plans/{runner.Plan}/check-ins/{date:yyyy-MM-dd}/{type}"), new { status = "Done" }))
            .EnsureSuccessStatusCode();

        var logged = (await Json(await runner.Client.GetAsync(Url("/api/v1/me/running")))).EnumerateArray().ShouldHaveSingleItem();
        logged.GetProperty("source").GetString().ShouldBe("Ticked");
        logged.GetProperty("distanceKm").GetDouble().ShouldBe(planned);
    }

    [Fact]
    public async Task The_coachs_kept_call_is_never_made_from_strava_runs()
    {
        // Monday 19 October: week 2's call is made from week 1, every run of which is on Strava and nowhere else.
        await using var factory = new TickPromptFactory(new DateTimeOffset(2026, 10, 19, 5, 0, 0, TimeSpan.Zero));
        var runner = await Ready(factory, endpoint: null);
        foreach (var (date, _) in runner.Runs.Where(r => r.Date < new DateOnly(2026, 10, 19)))
        {
            await RunOnStrava(factory, runner, new DateTimeOffset(date.ToDateTime(new TimeOnly(4, 0)), TimeSpan.Zero), metres: 10_000);
        }

        (await Json(await runner.Client.GetAsync(Url("/api/v1/me/activities")))).GetArrayLength().ShouldBeGreaterThan(0);

        var call = (await Json(await runner.Client.PostAsync(Url($"/api/v1/me/plans/{runner.Plan}/coach"), null))).GetProperty("coaching").EnumerateArray().ShouldHaveSingleItem();
        call.GetProperty("verdict").GetString().ShouldBe("NotEnoughToGoOn");
        call.GetProperty("fitness").ValueKind.ShouldBe(JsonValueKind.Null);
    }
}

/// <summary>The API with Strava and reminders both on, each faked. The tests drive the sync and nothing runs by itself.</summary>
public sealed class TickPromptFactory : StartLineApiFactory
{
    public TickPromptFactory(DateTimeOffset now)
    {
        Time.SetUtcNow(now);
        Strava = new FakeStravaApi { Time = Time };
    }

    public FakeStravaApi Strava { get; }

    public FakePushSender Push { get; } = new();

    /// <summary><c>Push:IncludeRunData</c>: let the prompt say the run's distance.</summary>
    public bool IncludeRunData { get; init; }

    protected override IDictionary<string, string?> Settings => new Dictionary<string, string?>
    {
        ["Strava:ClientId"] = "1",
        ["Strava:ClientSecret"] = "not-a-real-secret",
        ["Strava:RedirectUri"] = "https://taperday.test/strava/callback",
        ["Strava:HookSecret"] = StravaApiFactory.HookSecret,
        ["Strava:VerifyToken"] = StravaApiFactory.VerifyToken,
        ["Strava:SubscriptionId"] = StravaApiFactory.SubscriptionId.ToString(CultureInfo.InvariantCulture),
        ["Push:PublicKey"] = Base64Url.EncodeToString([0x04, .. Enumerable.Repeat((byte)7, 64)]),
        ["Push:PrivateKey"] = Base64Url.EncodeToString([.. Enumerable.Repeat((byte)9, 32)]),
        ["Push:Subject"] = "mailto:reminders@taperday.test",
        ["Push:IncludeRunData"] = IncludeRunData ? "true" : "false",
    };

    protected override void ConfigureServices(IServiceCollection services)
    {
        services.RemoveAll<IStravaApi>();
        services.AddSingleton<IStravaApi>(Strava);
        services.RemoveAll<IPushSender>();
        services.AddSingleton<IPushSender>(Push);
        foreach (var worker in services.Where(d => d.ImplementationType == typeof(StravaSyncWorker) || d.ImplementationType == typeof(ReminderWorker)).ToList())
        {
            services.Remove(worker);
        }
    }

    /// <summary>Runs every sync job that's due now, as the worker would, until nothing more is due.</summary>
    public async Task SyncAsync()
    {
        for (var pass = 0; pass < 20; pass++)
        {
            await using var scope = Services.CreateAsyncScope();
            var next = await scope.ServiceProvider.GetRequiredService<IStravaSync>().RunDueAsync(CancellationToken.None);
            if (next is null || next > Time.GetUtcNow())
            {
                return;
            }
        }

        throw new InvalidOperationException("The sync kept finding work: a job is looping.");
    }
}
