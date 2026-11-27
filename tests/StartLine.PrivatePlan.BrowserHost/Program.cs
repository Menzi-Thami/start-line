using System.Net.Http.Json;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Infrastructure.Persistence;
using StartLine.Integration.Tests;

// Test-only executable: real Kestrel/API/SQL, synthetic test authentication. Never deployed with the API.
await using var factory = new PrivateBrowserFactory();
using var client = factory.CreateClient();
// Each scenario owns its own account, state and rate-limit bucket.
string[] subjects = ["synthetic-private-browser-owner", "synthetic-private-browser-390-light", "synthetic-private-browser-390-dark",
    "synthetic-private-browser-1440-light", "synthetic-private-browser-1440-dark"];
foreach (var subject in subjects)
{
    client.As(subject);
    (await client.PutAsJsonAsync(new Uri("/api/v1/me", UriKind.Relative), new
    {
        displayName = "Synthetic private runner",
        timeZone = "Etc/UTC",
        units = "Kilometres",
        weeklyEmails = false,
        acceptPrivacyNotice = true,
    })).EnsureSuccessStatusCode();
}
await using (var scope = factory.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
    foreach (var runner in await db.Runners.Where(r => subjects.Contains(r.IdentitySubject)).ToListAsync())
    {
        runner.SetPrivatePrescriptionsEnabled(true);
    }
    await db.SaveChangesAsync();
}
Console.WriteLine("Synthetic persisted browser host ready on loopback port 5142.");
await Task.Delay(Timeout.InfiniteTimeSpan);

internal sealed class PrivateBrowserFactory : StartLineApiFactory
{
    public PrivateBrowserFactory() => UseKestrel(5142);
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseContentRoot(Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../src/StartLine.API")));
    }
    protected override void ConfigureServices(IServiceCollection services) => services.PostConfigure<CorsOptions>(options =>
        options.AddPolicy("spa", policy => policy.WithOrigins("http://127.0.0.1:5178").AllowAnyHeader().AllowAnyMethod()));
}
