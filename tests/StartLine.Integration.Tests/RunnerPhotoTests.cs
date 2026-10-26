using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace StartLine.Integration.Tests;

public sealed class RunnerPhotoTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    // A JPEG's first bytes are enough for the check, and keep the test small.
    private static readonly string Jpeg = "data:image/jpeg;base64," + Convert.ToBase64String([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);

    private static Uri Url(string path) => new(path, UriKind.Relative);

    private async Task<HttpClient> SignedUp()
    {
        var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        (await client.PutAsJsonAsync(Url("/api/v1/me"), new
        {
            displayName = "Thandi",
            timeZone = "Africa/Johannesburg",
            units = "Kilometres",
            weeklyEmails = false,
            acceptPrivacyNotice = true,
        })).EnsureSuccessStatusCode();
        return client;
    }

    [Fact]
    public async Task A_runner_has_no_picture_until_they_add_one_and_can_remove_it()
    {
        var client = await SignedUp();
        (await client.GetAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await client.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = Jpeg })).StatusCode.ShouldBe(HttpStatusCode.OK);
        var saved = JsonDocument.Parse(await client.GetStringAsync(Url("/api/v1/me/photo"))).RootElement;
        saved.GetProperty("dataUrl").GetString().ShouldBe(Jpeg);

        (await client.DeleteAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.GetAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Turns_away_a_file_that_only_claims_to_be_a_picture()
    {
        var client = await SignedUp();
        var fake = "data:image/jpeg;base64," + Convert.ToBase64String("<script>"u8.ToArray());

        (await client.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = fake })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task The_export_includes_the_picture_and_deleting_the_account_removes_it()
    {
        var client = await SignedUp();
        (await client.PutAsJsonAsync(Url("/api/v1/me/photo"), new { dataUrl = Jpeg })).EnsureSuccessStatusCode();

        var export = JsonDocument.Parse(await client.GetStringAsync(Url("/api/v1/me/export"))).RootElement;
        export.GetProperty("photo").GetProperty("dataUrl").GetString().ShouldBe(Jpeg);

        (await client.DeleteAsync(Url("/api/v1/me"))).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.GetAsync(Url("/api/v1/me/photo"))).StatusCode.ShouldNotBe(HttpStatusCode.OK);
    }
}
