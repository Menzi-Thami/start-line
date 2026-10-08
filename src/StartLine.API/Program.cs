using Scalar.AspNetCore;
using StartLine.API;
using StartLine.API.Infrastructure;
using StartLine.Application;
using StartLine.Application.Features.Races;
using StartLine.Infrastructure;

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
    .AddInfrastructure()
    .AddPresentation(builder.Configuration, builder.Environment);

var app = builder.Build();

// Build the catalogue now, so a bad race entry stops the app at boot instead of failing every request.
_ = app.Services.GetRequiredService<IRaceCatalogue>();

app.UseForwardedHeaders();
app.UseMiddleware<TraceIdMiddleware>();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors(PresentationDependencyInjection.SpaCorsPolicy);
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().WithDocumentPerVersion();
    app.MapScalarApiReference();
}

app.MapHealthChecks("/health/live", new() { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new() { Predicate = c => c.Tags.Contains("ready") });
app.MapControllers();

await app.RunAsync();

#pragma warning disable CA1515 // WebApplicationFactory<Program> in the integration tests needs this public.
public partial class Program;
#pragma warning restore CA1515
