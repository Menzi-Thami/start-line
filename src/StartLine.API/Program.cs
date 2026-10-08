using Scalar.AspNetCore;
using StartLine.API;
using StartLine.API.Infrastructure;
using StartLine.Application;
using StartLine.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

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
