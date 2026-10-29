using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Domain.Runners;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

// TestServer does not enforce Kestrel's request limits. Use a real loopback HTTP server and disposable SQL.
public sealed class RunnerPhotoHttpTests(RunnerPhotoHttpFactory factory) : IClassFixture<RunnerPhotoHttpFactory>
{
    private static Uri Url(string path) => new(path, UriKind.Relative);

    private async Task<(HttpClient Client, string Subject, Guid RunnerId)> SignedUp()
    {
        var subject = Guid.NewGuid().ToString();
        var client = factory.CreateClient().As(subject);
        var response = await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Picture QA",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        });
        response.EnsureSuccessStatusCode();
        var runner = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return (client, subject, runner.GetProperty("id").GetGuid());
    }

    private static string Jpeg(int bytes)
    {
        var data = new byte[bytes];
        data[0] = 0xFF;
        data[1] = 0xD8;
        data[2] = 0xFF;
        return "data:image/jpeg;base64," + Convert.ToBase64String(data);
    }

    [Theory]
    [InlineData(24 * 1024)]
    [InlineData(RunnerPhoto.MaxBytes)]
    public async Task A_small_profile_picture_above_16_KB_saves_reloads_and_replaces_one_database_row(int bytes)
    {
        var (client, subject, runnerId) = await SignedUp();
        var original = Jpeg(bytes);
        (await client.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = original })).StatusCode.ShouldBe(HttpStatusCode.OK);

        using var reopened = factory.CreateClient().As(subject);
        var saved = JsonDocument.Parse(await reopened.GetStringAsync(Url("/api/v1/me/photo"))).RootElement;
        saved.GetProperty("dataUrl").GetString().ShouldBe(original);

        var replacement = Jpeg(20 * 1024);
        (await reopened.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = replacement })).EnsureSuccessStatusCode();
        using var scope = factory.Services.CreateScope();
        var photos = scope.ServiceProvider.GetRequiredService<StartLineDbContext>().RunnerPhotos;
        var rows = await photos.Where(p => p.RunnerId == runnerId).ToListAsync();
        rows.ShouldHaveSingleItem().Data.Length.ShouldBe(20 * 1024);

        (await client.DeleteAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.DeleteAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await reopened.GetAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await photos.CountAsync(p => p.RunnerId == runnerId)).ShouldBe(0);
    }

    [Fact]
    public async Task A_rejected_replacement_keeps_the_previous_picture_and_the_existing_storage_cap()
    {
        var (client, _, _) = await SignedUp();
        var original = Jpeg(20 * 1024);
        (await client.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = original })).EnsureSuccessStatusCode();
        var response = await client.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = Jpeg(RunnerPhoto.MaxBytes + 1) });
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var saved = JsonDocument.Parse(await client.GetStringAsync(Url("/api/v1/me/photo"))).RootElement;
        saved.GetProperty("dataUrl").GetString().ShouldBe(original);
    }

    [Fact]
    public async Task Another_account_does_not_receive_the_picture()
    {
        var (client, _, _) = await SignedUp();
        (await client.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = Jpeg(24 * 1024) })).EnsureSuccessStatusCode();
        var (other, _, _) = await SignedUp();
        (await other.GetAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Genuinely_invalid_json_still_returns_a_validation_error()
    {
        var (client, _, _) = await SignedUp();
        using var body = new StringContent("{\"dataUrl\":", Encoding.UTF8, "application/json");
        var response = await client.PutAsync(Url("/api/v1/me/photo"), body);
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var error = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        error.GetProperty("code").GetString().ShouldBe("validation_failed");
    }

    [Theory]
    [InlineData("/api/v1/me/photo", 200 * 1024)]
    [InlineData("/api/v1/me", 20 * 1024)]
    public async Task Oversized_requests_return_413_instead_of_a_malformed_error_and_other_limits_stay_small(string path, int size)
    {
        var (client, _, _) = await SignedUp();
        using var body = new StringContent("{\"dataUrl\":\"" + new string('A', size) + "\"}", Encoding.UTF8, "application/json");
        var response = await client.PutAsync(Url(path), body);
        response.StatusCode.ShouldBe(HttpStatusCode.RequestEntityTooLarge);
        var error = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        error.GetProperty("code").GetString().ShouldBe("request_too_large");
    }
}

public sealed class RunnerPhotoHttpFactory : StartLineApiFactory
{
    public RunnerPhotoHttpFactory() => UseKestrel(0);
}
