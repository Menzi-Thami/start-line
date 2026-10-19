using System.Collections.Concurrent;
using System.Globalization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StartLine.Application.Features.Sync;
using StartLine.Infrastructure.Sync;

namespace StartLine.Integration.Tests;

/// <summary>
/// Strava in memory: athletes, their runs and streams, and the tokens it handed out. Behaves like Strava where it
/// matters (404 for someone else's run, 401 once access is revoked, refresh tokens rotate) so CI never needs credentials.
/// </summary>
public sealed class FakeStravaApi : IStravaApi
{
    private readonly ConcurrentDictionary<long, (StravaActivity Activity, StravaStreams Streams)> activities = new();
    private readonly ConcurrentDictionary<long, byte> revoked = new();
    private long nextId = 1000;
    private int tokenGeneration;

    public ConcurrentQueue<long> Deauthorized { get; } = new();

    public ConcurrentQueue<string> Calls { get; } = new();

    /// <summary>How long a new access token lasts.</summary>
    public TimeSpan TokenLifetime { get; set; } = TimeSpan.FromHours(6);

    /// <summary>The clock new tokens are dated from: the app's own fake clock.</summary>
    public required TimeProvider Time { get; init; }

    /// <summary>Thrown by the next activity read, once.</summary>
    public Exception? FailNextRead { get; set; }

    public static string CodeFor(long athleteId) => string.Create(CultureInfo.InvariantCulture, $"code-{athleteId}");

    public long AddRun(long athleteId, DateTimeOffset start, double metres = 8000, double secondsPerKm = 360, string sportType = "Run", string? device = "Garmin Forerunner 265")
    {
        var id = Interlocked.Increment(ref nextId);
        var seconds = (int)Math.Round(metres / 1000 * secondsPerKm);
        var streams = new StravaStreams(
            [.. Enumerable.Range(0, seconds + 1)],
            [.. Enumerable.Range(0, seconds + 1).Select(t => metres * t / seconds)],
            [.. Enumerable.Range(0, seconds + 1).Select(_ => 100.0)],
            [.. Enumerable.Range(0, seconds + 1).Select(_ => 148)]);
        activities[id] = (new StravaActivity(id, athleteId, sportType, start, false, false, 12, 148, 160, 500, device), streams);
        return id;
    }

    public void Edit(long id, double metres, double secondsPerKm)
    {
        var (activity, _) = activities[id];
        activities.TryRemove(id, out _);
        var replacement = AddRun(activity.AthleteId, activity.StartDate, metres, secondsPerKm, activity.SportType, activity.DeviceName);
        var (edited, streams) = activities[replacement];
        activities.TryRemove(replacement, out _);
        activities[id] = (edited with { Id = id }, streams);
    }

    public void Delete(long id) => activities.TryRemove(id, out _);

    public void Revoke(long athleteId) => revoked[athleteId] = 0;

    public Uri AuthorizeUrl(string state, Uri redirectUri) =>
        new($"https://www.strava.com/oauth/authorize?client_id=1&redirect_uri={Uri.EscapeDataString(redirectUri.ToString())}&state={Uri.EscapeDataString(state)}");

    public Task<StravaTokenGrant> ExchangeCodeAsync(string code, CancellationToken cancellationToken)
    {
        Calls.Enqueue("token");
        var athlete = long.Parse(code.Replace("code-", "", StringComparison.Ordinal), CultureInfo.InvariantCulture);
        revoked.TryRemove(athlete, out _);
        return Task.FromResult(Grant(athlete, includeAthlete: true));
    }

    public Task<StravaTokenGrant> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        Calls.Enqueue("refresh");
        var athlete = AthleteOf(refreshToken);
        return Task.FromResult(Grant(athlete, includeAthlete: false));
    }

    public Task DeauthorizeAsync(string accessToken, CancellationToken cancellationToken)
    {
        var athlete = AthleteOf(accessToken);
        Deauthorized.Enqueue(athlete);
        revoked[athlete] = 0;
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<StravaActivitySummary>> ListActivitiesAsync(string accessToken, DateTimeOffset after, int page, CancellationToken cancellationToken)
    {
        Calls.Enqueue("list");
        var athlete = AthleteOf(accessToken);
        IReadOnlyList<StravaActivitySummary> list = [.. activities.Values
            .Select(a => a.Activity)
            .Where(a => a.AthleteId == athlete && a.StartDate > after)
            .OrderBy(a => a.StartDate)
            .Skip((page - 1) * IStravaApi.PageSize)
            .Take(IStravaApi.PageSize)
            .Select(a => new StravaActivitySummary(a.Id, a.SportType, a.StartDate))];
        return Task.FromResult(list);
    }

    public Task<StravaActivity?> GetActivityAsync(string accessToken, long activityId, CancellationToken cancellationToken)
    {
        Calls.Enqueue($"activity {activityId}");
        if (FailNextRead is { } failure)
        {
            FailNextRead = null;
            throw failure;
        }

        var athlete = AthleteOf(accessToken);
        return Task.FromResult(activities.TryGetValue(activityId, out var a) && a.Activity.AthleteId == athlete ? a.Activity : null);
    }

    public Task<StravaStreams?> GetStreamsAsync(string accessToken, long activityId, CancellationToken cancellationToken)
    {
        Calls.Enqueue($"streams {activityId}");
        var athlete = AthleteOf(accessToken);
        return Task.FromResult(activities.TryGetValue(activityId, out var a) && a.Activity.AthleteId == athlete ? a.Streams : null);
    }

    private StravaTokenGrant Grant(long athlete, bool includeAthlete)
    {
        var n = Interlocked.Increment(ref tokenGeneration);
        return new StravaTokenGrant(
            string.Create(CultureInfo.InvariantCulture, $"access-{athlete}-{n}"),
            string.Create(CultureInfo.InvariantCulture, $"refresh-{athlete}-{n}"),
            Time.GetUtcNow() + TokenLifetime,
            includeAthlete ? athlete : null);
    }

    private long AthleteOf(string token)
    {
        var athlete = long.Parse(token.Split('-')[1], CultureInfo.InvariantCulture);
        if (revoked.ContainsKey(athlete))
        {
            throw new StravaUnauthorizedException("Revoked.");
        }

        return athlete;
    }
}

/// <summary>The API with Strava switched on, talking to <see cref="FakeStravaApi"/>. Tests run the sync themselves.</summary>
public sealed class StravaApiFactory : StartLineApiFactory
{
    public const string HookSecret = "hook-secret-for-tests-0123456789";
    public const string VerifyToken = "verify-token-for-tests-012345678";
    public const long SubscriptionId = 9001;

    public StravaApiFactory()
    {
        Strava = new FakeStravaApi { Time = Time };
    }

    public FakeStravaApi Strava { get; }

    protected override IDictionary<string, string?> Settings => new Dictionary<string, string?>
    {
        ["Strava:ClientId"] = "1",
        ["Strava:ClientSecret"] = "not-a-real-secret",
        ["Strava:RedirectUri"] = "https://taperday.test/?strava=callback",
        ["Strava:HookSecret"] = HookSecret,
        ["Strava:VerifyToken"] = VerifyToken,
        ["Strava:SubscriptionId"] = SubscriptionId.ToString(CultureInfo.InvariantCulture),
    };

    protected override void ConfigureServices(IServiceCollection services)
    {
        services.RemoveAll<IStravaApi>();
        services.AddSingleton<IStravaApi>(Strava);
        // The tests drive the sync step by step, so the background worker is left out.
        var worker = services.Single(d => d.ServiceType == typeof(Microsoft.Extensions.Hosting.IHostedService) && d.ImplementationType == typeof(StravaSyncWorker));
        services.Remove(worker);
    }

    /// <summary>Runs every job that's due now, as the worker would, until nothing more is due.</summary>
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
