using System.Net;
using System.Net.Http.Json;

namespace StartLine.Integration.Tests;

public sealed class FeedbackTests(StartLineApiFactory factory) : IClassFixture<StartLineApiFactory>
{
    private static Uri Url(string path) => new(path, UriKind.Relative);

    [Fact]
    public async Task A_runner_can_send_feedback_and_finds_it_in_their_export()
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

        (await client.PostAsJsonAsync(Url("/api/v1/me/feedback"), new { message = "Love the week strip", page = "home" })).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await client.PostAsJsonAsync(Url("/api/v1/me/feedback"), new { message = "", page = "home" })).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await client.GetStringAsync(Url("/api/v1/me/export"))).ShouldContain("Love the week strip");
    }
}
