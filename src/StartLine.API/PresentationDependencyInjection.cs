using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using StartLine.API.Infrastructure;

namespace StartLine.API;

internal static class PresentationDependencyInjection
{
    public const string SpaCorsPolicy = "spa";
    public const string PlanRateLimitPolicy = "plans";

    public static IServiceCollection AddPresentation(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
            ctx.ProblemDetails.Extensions["traceId"] = Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier);
        services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

        services.AddControllers()
            .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()))
            .ConfigureApiBehaviorOptions(o =>
            {
                // Malformed JSON never reaches the validators; give it the same error code they use.
                var defaultFactory = o.InvalidModelStateResponseFactory;
                o.InvalidModelStateResponseFactory = ctx =>
                {
                    var result = defaultFactory(ctx);
                    if (result is ObjectResult { Value: ProblemDetails problem })
                    {
                        problem.Extensions["code"] = "validation_failed";
                    }

                    return result;
                };
            });
        services.AddApiVersioning(o =>
            {
                o.DefaultApiVersion = new ApiVersion(1);
                o.ApiVersionReader = new UrlSegmentApiVersionReader();
                o.ReportApiVersions = true;
            })
            .AddMvc()
            .AddApiExplorer(o =>
            {
                o.GroupNameFormat = "'v'V";
                o.SubstituteApiVersionInUrl = true;
            })
            .AddOpenApi();

        services.AddCors(o => o.AddPolicy(SpaCorsPolicy, p => p
            .WithOrigins(configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .WithMethods("GET", "POST")
            .WithHeaders("Content-Type")));

        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = (ctx, _) =>
            {
                if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    ctx.HttpContext.Response.Headers.RetryAfter =
                        ((int)retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
                }

                return ValueTask.CompletedTask;
            };

            // No accounts yet, so every caller is partitioned by IP address.
            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                RateLimitPartition.GetTokenBucketLimiter(ClientKey(ctx), _ => new TokenBucketRateLimiterOptions
                {
                    TokenLimit = 100,
                    TokensPerPeriod = 50,
                    ReplenishmentPeriod = TimeSpan.FromSeconds(10),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

            o.AddPolicy(PlanRateLimitPolicy, ctx =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 30,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
        });

        services.AddHealthChecks();

        var otel = services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService(environment.ApplicationName))
            .WithTracing(t => t.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation())
            .WithMetrics(m => m.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddRuntimeInstrumentation())
            .WithLogging();
        if (!string.IsNullOrWhiteSpace(configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            otel.UseOtlpExporter();
        }

        return services;
    }

    private static string ClientKey(HttpContext context) =>
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
