using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Asp.Versioning;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Identity.Web;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using StartLine.API.Infrastructure;
using StartLine.Application.Common;
using StartLine.Infrastructure.Push;

namespace StartLine.API;

internal static class PresentationDependencyInjection
{
    public const string SpaCorsPolicy = "spa";
    public const string PlanRateLimitPolicy = "plans";
    public const string UploadRateLimitPolicy = "uploads";
    public const string BulkUploadRateLimitPolicy = "bulk-uploads";
    public const string WebhookRateLimitPolicy = "webhooks";
    public const string RunnerPolicy = "runner";
    public const string DefaultScope = "Plans.ReadWrite";

    public static IServiceCollection AddPresentation(
        this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        // Rate limits are partitioned by client IP, so behind a proxy the real IP must come from
        // X-Forwarded-For, but only when the request arrived through a proxy we trust. Otherwise
        // any client could pick its own partition by sending the header.
        services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            o.ForwardLimit = 1;
            foreach (var proxy in configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
            {
                o.KnownProxies.Add(IPAddress.Parse(proxy));
            }

            foreach (var network in configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [])
            {
                o.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            }
        });

        AddIdentity(services, configuration);

        services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
            ctx.ProblemDetails.Extensions["traceId"] = Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier);
        services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

        // The OpenAPI generator reads the minimal-API JSON options, not MVC's, so both need the
        // string-enum converter or the document describes enums as integers the API never sends.
        // Numbers must be JSON numbers: the web defaults also accept "40", which loosens input and
        // makes the documented schema number-or-string.
        services.ConfigureHttpJsonOptions(o =>
        {
            o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
            o.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
        });
        services.AddControllers()
            .AddJsonOptions(o =>
            {
                o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
                o.JsonSerializerOptions.NumberHandling = JsonNumberHandling.Strict;
            })
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
        services.ConfigureAll<OpenApiOptions>(o => o.AddSchemaTransformer<EnumSchemaTransformer>());

        services.AddCors(o => o.AddPolicy(SpaCorsPolicy, p => p
            .WithOrigins(configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            .WithMethods("GET", "POST", "PUT", "DELETE")
            .WithHeaders("Content-Type", "Authorization")));

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

            // Signed-in runners get their own bucket; anonymous callers share one per IP address.
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

            // Reading a file costs far more than a plan request. Enough for a runner catching up on a month of runs.
            o.AddPolicy(UploadRateLimitPolicy, ctx =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 60,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0,
                }));

            // A backfill: 60 batches of up to 20 files is 1,200 runs an hour, more than the 1,000 a runner can keep.
            o.AddPolicy(BulkUploadRateLimitPolicy, ctx =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 60,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0,
                }));

            // Strava pushes one event per change and retries at most twice; this is far above that and still caps a flood.
            o.AddPolicy(WebhookRateLimitPolicy, ctx =>
                RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 120,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
        });

        services.AddHealthChecks()
            .AddCheck<RaceCatalogueHealthCheck>("race-catalogue", tags: ["ready"]);

        var otel = services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService(environment.ApplicationName))
            .WithTracing(t => t
                .AddAspNetCoreInstrumentation(o => o.EnrichWithHttpRequest = SecretPaths.Redact)
                .AddHttpClientInstrumentation(o => o.EnrichWithHttpRequestMessage = PushTraces.Redact))
            .WithMetrics(m => m.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation().AddRuntimeInstrumentation())
            .WithLogging();
        if (!string.IsNullOrWhiteSpace(configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            otel.UseOtlpExporter();
        }

        return services;
    }

    private static string ClientKey(HttpContext context) =>
        context.User.GetObjectId() is { } user
            ? $"user:{user}"
            : $"ip:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";

    private static void AddIdentity(IServiceCollection services, IConfiguration configuration)
    {
        // Sign-in is optional to run: without an External ID app registration, accounts are switched off.
        if (string.IsNullOrWhiteSpace(configuration["AzureAd:ClientId"]))
        {
            services.AddAuthentication(AccountsDisabledHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, AccountsDisabledHandler>(AccountsDisabledHandler.SchemeName, null);
        }
        else
        {
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddMicrosoftIdentityWebApi(configuration.GetSection("AzureAd"));
        }

        // Fail closed: every endpoint needs a signed-in user unless it opts out with [AllowAnonymous].
        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
            .AddPolicy(RunnerPolicy, p => p.RequireAuthenticatedUser().RequireScope(configuration["AzureAd:Scope"] ?? DefaultScope));

        // RequireScope needs this handler. AddMicrosoftIdentityWebApi registers it, but the accounts-off path and the
        // test sign-in don't, and without it the requirement can never pass.
        services.AddRequiredScopeAuthorization();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();
    }
}
