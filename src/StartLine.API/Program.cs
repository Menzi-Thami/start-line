using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using StartLine.API;
using StartLine.API.Infrastructure;
using StartLine.Application;
using StartLine.Application.Features.Races;
using StartLine.Infrastructure;
using StartLine.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// Plan requests are a few hundred bytes; anything near this size is a mistake or an attack.
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 16 * 1024);

builder.Host.UseDefaultServiceProvider(o =>
{
    o.ValidateScopes = true;
    o.ValidateOnBuild = true;
});

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddPresentation(builder.Configuration, builder.Environment);

// Strava tokens are only as safe as the key ring that encrypts them. Outside development that ring must be wrapped by
// Key Vault, or a copy of the database would be enough to read them.
if (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing")
    && !string.IsNullOrWhiteSpace(builder.Configuration["Strava:ClientId"])
    && string.IsNullOrWhiteSpace(builder.Configuration[StartLine.Infrastructure.DependencyInjection.KeyVaultKeySetting]))
{
    throw new InvalidOperationException($"Strava is configured but {StartLine.Infrastructure.DependencyInjection.KeyVaultKeySetting} isn't: set it so tokens are encrypted with a Key Vault key.");
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    // Locally the schema follows the code. Elsewhere, migrations are applied by the deploy pipeline.
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<StartLineDbContext>().Database.MigrateAsync();
}

// Publish the race calendar before serving requests. Building the sync also builds every source,
// so a bad race entry stops the app here instead of failing every request.
await app.Services.GetRequiredService<RaceCalendarSync>().RunAsync(app.Lifetime.ApplicationStopping);

app.UseForwardedHeaders();
app.UseMiddleware<TraceIdMiddleware>();
app.UseExceptionHandler();
// Empty 401/403/404 responses (from auth or routing) become ProblemDetails like every other error.
app.UseStatusCodePages();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors(PresentationDependencyInjection.SpaCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().WithDocumentPerVersion().AllowAnonymous();
    app.MapScalarApiReference().AllowAnonymous();
}

app.MapHealthChecks("/health/live", new() { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new() { Predicate = c => c.Tags.Contains("ready") }).AllowAnonymous();
app.MapControllers();

await app.RunAsync();

#pragma warning disable CA1515 // WebApplicationFactory<Program> in the integration tests needs this public.
public partial class Program;
#pragma warning restore CA1515
