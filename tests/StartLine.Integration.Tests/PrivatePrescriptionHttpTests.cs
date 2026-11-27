using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>Kestrel enforces the bounded private import independently of TestServer's JSON parsing.</summary>
public sealed class PrivatePrescriptionHttpTests(RunnerPhotoHttpFactory factory) : IClassFixture<RunnerPhotoHttpFactory>
{
    [Fact]
    public async Task Real_http_accepts_a_valid_import_above_16_KB_and_rejects_more_than_512_KB()
    {
        using var client = factory.CreateClient().As(Guid.NewGuid().ToString());
        var profile = await client.PutAsJsonAsync(new Uri("/api/v1/me", UriKind.Relative), new { displayName = "Synthetic import QA", timeZone = "Etc/UTC", units = "Kilometres", weeklyEmails = false, acceptPrivacyNotice = true });
        profile.EnsureSuccessStatusCode();
        var runnerId = (await profile.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
            var runner = await db.Runners.SingleAsync(r => r.Id == runnerId);
            runner.SetPrivatePrescriptionsEnabled(true);
            await db.SaveChangesAsync();
        }
        var payload = PrivatePrescriptionTests.Payload();
        foreach (var session in payload["prescription"]!["sessions"]!.AsArray()) session!["notes"] = new string('A', 600);
        Encoding.UTF8.GetByteCount(payload.ToJsonString()).ShouldBeGreaterThan(16 * 1024);
        (await client.PostAsJsonAsync(new Uri("/api/v1/me/private-prescriptions/preview", UriKind.Relative), payload)).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var tooBig = new StringContent("{\"name\":\"" + new string('A', 513 * 1024) + "\"}", Encoding.UTF8, "application/json");
        (await client.PostAsync(new Uri("/api/v1/me/private-prescriptions/preview", UriKind.Relative), tooBig)).StatusCode.ShouldBe(HttpStatusCode.RequestEntityTooLarge);
    }
}
