using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using StartLine.Application.Features.Sync;
using StartLine.Domain.Sync;

namespace StartLine.Infrastructure.Sync;

/// <summary>
/// Strava's REST API over HTTP. Reads only what Taperday uses (never <c>latlng</c>), reports Strava's rate-limit
/// headers to the <see cref="StravaRateGate"/> after every call, and turns Strava's failures into typed exceptions.
/// </summary>
internal sealed class HttpStravaApi(HttpClient http, IOptions<StravaOptions> options, StravaRateGate gate) : IStravaApi
{
    /// <summary>Everything Taperday reads, and private runs too so they can be judged against the plan.</summary>
    public const string Scope = "read,activity:read_all";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private StravaOptions Settings => options.Value;

    public Uri AuthorizeUrl(string state, Uri redirectUri)
    {
        ArgumentNullException.ThrowIfNull(redirectUri);
        var query = string.Join('&',
            $"client_id={Uri.EscapeDataString(Settings.ClientId)}",
            "response_type=code",
            $"redirect_uri={Uri.EscapeDataString(redirectUri.ToString())}",
            "approval_prompt=auto",
            $"scope={Uri.EscapeDataString(Scope)}",
            $"state={Uri.EscapeDataString(state)}");
        return new Uri(Settings.OAuthBaseUrl, $"authorize?{query}");
    }

    public Task<StravaTokenGrant> ExchangeCodeAsync(string code, CancellationToken cancellationToken) =>
        TokenAsync(new Dictionary<string, string> { ["code"] = code, ["grant_type"] = "authorization_code" }, cancellationToken);

    public Task<StravaTokenGrant> RefreshAsync(string refreshToken, CancellationToken cancellationToken) =>
        TokenAsync(new Dictionary<string, string> { ["refresh_token"] = refreshToken, ["grant_type"] = "refresh_token" }, cancellationToken);

    public async Task DeauthorizeAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(Settings.OAuthBaseUrl, Settings.DeauthorizePath))
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["access_token"] = accessToken }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, allowNotFound: false);
    }

    public async Task<IReadOnlyList<StravaActivitySummary>> ListActivitiesAsync(string accessToken, DateTimeOffset after, int page, CancellationToken cancellationToken)
    {
        var path = string.Create(CultureInfo.InvariantCulture, $"athlete/activities?after={after.ToUnixTimeSeconds()}&page={page}&per_page={IStravaApi.PageSize}");
        var list = await GetAsync<List<ActivityJson>>(accessToken, path, cancellationToken) ?? [];
        return [.. list.Select(a => new StravaActivitySummary(a.Id, a.SportType ?? "", a.StartDate))];
    }

    public async Task<StravaActivity?> GetActivityAsync(string accessToken, long activityId, CancellationToken cancellationToken)
    {
        var a = await GetAsync<ActivityJson>(accessToken, string.Create(CultureInfo.InvariantCulture, $"activities/{activityId}"), cancellationToken);
        return a is null
            ? null
            : new StravaActivity(a.Id, a.Athlete?.Id ?? 0, a.SportType ?? "", a.StartDate, a.Trainer, a.Manual, a.TotalElevationGain,
                a.AverageHeartrate, a.MaxHeartrate, a.Calories, a.DeviceName);
    }

    public async Task<StravaStreams?> GetStreamsAsync(string accessToken, long activityId, CancellationToken cancellationToken)
    {
        // Location is never asked for: Taperday doesn't keep where anyone runs (and Policy 5.7 limits it anyway).
        var path = string.Create(CultureInfo.InvariantCulture, $"activities/{activityId}/streams?keys=time,distance,altitude,heartrate&key_by_type=true");
        var s = await GetAsync<StreamsJson>(accessToken, path, cancellationToken);
        if (s?.Time?.Data is not { } time || s.Distance?.Data is not { } distance)
        {
            return null;
        }

        return new StravaStreams(
            [.. time.Select(t => (int)Math.Round(t))],
            distance,
            s.Altitude?.Data,
            s.Heartrate?.Data is { } hr ? [.. hr.Select(b => (int)Math.Round(b))] : null);
    }

    private async Task<StravaTokenGrant> TokenAsync(Dictionary<string, string> form, CancellationToken cancellationToken)
    {
        form["client_id"] = Settings.ClientId;
        form["client_secret"] = Settings.ClientSecret;
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(Settings.OAuthBaseUrl, "token")) { Content = new FormUrlEncodedContent(form) };
        using var response = await SendAsync(request, cancellationToken);
        if (response.StatusCode is HttpStatusCode.BadRequest)
        {
            // Strava answers 400 to a used, expired or revoked code or refresh token.
            throw new StravaUnauthorizedException("Strava didn't accept that sign-in. Connect again.");
        }

        await EnsureSuccessAsync(response, allowNotFound: false);
        var token = await ReadAsync<TokenJson>(response, cancellationToken)
            ?? throw new StravaUnavailableException("Strava sent an empty token response.");
        if (string.IsNullOrEmpty(token.AccessToken) || string.IsNullOrEmpty(token.RefreshToken))
        {
            throw new StravaUnavailableException("Strava's token response had no tokens.");
        }

        return new StravaTokenGrant(token.AccessToken, token.RefreshToken, DateTimeOffset.FromUnixTimeSeconds(token.ExpiresAt), token.Athlete?.Id);
    }

    private async Task<T?> GetAsync<T>(string accessToken, string path, CancellationToken cancellationToken)
        where T : class
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(Settings.ApiBaseUrl, path));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await SendAsync(request, cancellationToken);
        if (!await EnsureSuccessAsync(response, allowNotFound: true))
        {
            return null;
        }

        return await ReadAsync<T>(response, cancellationToken);
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        }
        catch (HttpRequestException e)
        {
            throw new StravaUnavailableException("Couldn't reach Strava.", e);
        }
        catch (TaskCanceledException e) when (!cancellationToken.IsCancellationRequested)
        {
            throw new StravaUnavailableException("Strava took too long to answer.", e);
        }

        RecordUsage(response.Headers);
        return response;
    }

    /// <returns>False for a 404 when that's allowed (the run is gone); true for success.</returns>
    private async Task<bool> EnsureSuccessAsync(HttpResponseMessage response, bool allowNotFound)
    {
        switch (response.StatusCode)
        {
            case HttpStatusCode.NotFound when allowNotFound:
                return false;
            case HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden:
                throw new StravaUnauthorizedException("Strava refused Taperday's access for this runner.");
            case HttpStatusCode.TooManyRequests:
                throw new StravaRateLimitedException(gate.RecordRejected());
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new StravaUnavailableException($"Strava answered {(int)response.StatusCode}: {body[..Math.Min(body.Length, 200)]}");
        }

        return true;
    }

    private static async Task<T?> ReadAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<T>(Json, cancellationToken);
        }
        catch (JsonException e)
        {
            throw new StravaUnavailableException("Strava sent something Taperday couldn't read.", e);
        }
    }

    // Reads use the non-upload ("read") limit when Strava reports it; it's the tighter of the two.
    private void RecordUsage(HttpResponseHeaders headers)
    {
        if (Pair(headers, "X-ReadRateLimit-Usage") is { } used && Pair(headers, "X-ReadRateLimit-Limit") is { } limit)
        {
            gate.Record(new ApiUsage(used.Short, limit.Short, used.Daily, limit.Daily));
        }
        else if (Pair(headers, "X-RateLimit-Usage") is { } u && Pair(headers, "X-RateLimit-Limit") is { } l)
        {
            gate.Record(new ApiUsage(u.Short, l.Short, u.Daily, l.Daily));
        }
    }

    private static (int Short, int Daily)? Pair(HttpResponseHeaders headers, string name)
    {
        if (!headers.TryGetValues(name, out var values))
        {
            return null;
        }

        var parts = string.Join(',', values).Split(',', StringSplitOptions.TrimEntries);
        return parts.Length >= 2
            && int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var shortTerm)
            && int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var daily)
            ? (shortTerm, daily)
            : null;
    }

    private sealed record TokenJson(
        [property: JsonPropertyName("access_token")] string? AccessToken,
        [property: JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: JsonPropertyName("expires_at")] long ExpiresAt,
        [property: JsonPropertyName("athlete")] AthleteJson? Athlete);

    private sealed record AthleteJson([property: JsonPropertyName("id")] long Id);

    private sealed record ActivityJson(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("athlete")] AthleteJson? Athlete,
        [property: JsonPropertyName("sport_type")] string? SportType,
        [property: JsonPropertyName("start_date")] DateTimeOffset StartDate,
        [property: JsonPropertyName("trainer")] bool Trainer,
        [property: JsonPropertyName("manual")] bool Manual,
        [property: JsonPropertyName("total_elevation_gain")] double? TotalElevationGain,
        [property: JsonPropertyName("average_heartrate")] double? AverageHeartrate,
        [property: JsonPropertyName("max_heartrate")] double? MaxHeartrate,
        [property: JsonPropertyName("calories")] double? Calories,
        [property: JsonPropertyName("device_name")] string? DeviceName);

    private sealed record StreamJson([property: JsonPropertyName("data")] List<double>? Data);

    private sealed record StreamsJson(
        [property: JsonPropertyName("time")] StreamJson? Time,
        [property: JsonPropertyName("distance")] StreamJson? Distance,
        [property: JsonPropertyName("altitude")] StreamJson? Altitude,
        [property: JsonPropertyName("heartrate")] StreamJson? Heartrate);
}
