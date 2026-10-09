using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Respawn;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Integration.Tests;

/// <summary>
/// The real pipeline, real race catalogue and a real SQL Server database (LocalDB here, a container in CI),
/// with the clock pinned so dates in assertions never drift. Never the EF in-memory provider.
/// </summary>
public class StartLineApiFactory : WebApplicationFactory<Program>
{
    public static readonly DateTimeOffset Now = new(2026, 10, 8, 9, 0, 0, TimeSpan.Zero);

    // CI sets STARTLINE_TEST_SQL to its SQL Server container; locally LocalDB is used.
    public static readonly string ConnectionString = Environment.GetEnvironmentVariable("STARTLINE_TEST_SQL")
        ?? @"Server=(localdb)\MSSQLLocalDB;Database=StartLine_IntegrationTests;Trusted_Connection=True;TrustServerCertificate=True";

    private static readonly SemaphoreSlim DatabaseGate = new(1, 1);
    private static bool _databaseReady;

    /// <summary>The clock the whole app runs on. Advancing it fires the race-sync timer.</summary>
    public FakeTimeProvider Time { get; } = new(Now);

    /// <summary>The address every test request appears to come from. The test server leaves it empty otherwise.</summary>
    protected virtual IPAddress CallerAddress => IPAddress.Parse("198.51.100.7");

    /// <summary>Extra settings a test needs, layered over the defaults.</summary>
    protected virtual IDictionary<string, string?> Settings => new Dictionary<string, string?>();

    protected virtual void ConfigureServices(IServiceCollection services)
    {
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                [$"ConnectionStrings:{DatabaseOptions.ConnectionStringName}"] = ConnectionString,
            });
            config.AddInMemoryCollection(Settings);
        });
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Time);

            // Requests sign in with headers (see TestAuth), which exercises the real authorization policies.
            services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuth.Scheme, null);
            services.PostConfigure<AuthenticationOptions>(o =>
            {
                o.DefaultScheme = TestAuth.Scheme;
                o.DefaultAuthenticateScheme = TestAuth.Scheme;
                o.DefaultChallengeScheme = TestAuth.Scheme;
            });

            ConfigureServices(services);
            services.AddSingleton<IStartupFilter>(new CallerAddressFilter(CallerAddress));
        });
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);
        EnsureDatabase(host.Services);
        return host;
    }

    // Migrate once per test run, then clear any rows left from earlier runs. Tests isolate themselves
    // with unique runner identities, so nothing needs resetting between tests.
    private static void EnsureDatabase(IServiceProvider services)
    {
        DatabaseGate.Wait();
        try
        {
            if (_databaseReady)
            {
                return;
            }

            using (var scope = services.CreateScope())
            {
                scope.ServiceProvider.GetRequiredService<StartLineDbContext>().Database.Migrate();
            }

            using var connection = new SqlConnection(ConnectionString);
            connection.Open();
            var respawner = Respawner.CreateAsync(connection, new RespawnerOptions
            {
                DbAdapter = DbAdapter.SqlServer,
                TablesToIgnore = ["__EFMigrationsHistory"],
            }).GetAwaiter().GetResult();
            respawner.ResetAsync(connection).GetAwaiter().GetResult();
            _databaseReady = true;
        }
        finally
        {
            DatabaseGate.Release();
        }
    }

    private sealed class CallerAddressFilter(IPAddress address) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use((context, nextMiddleware) =>
            {
                context.Connection.RemoteIpAddress = address;
                return nextMiddleware(context);
            });
            next(app);
        };
    }
}

/// <summary>The API as it runs behind a reverse proxy on a private network it has been told to trust.</summary>
public sealed class BehindTrustedProxyFactory : StartLineApiFactory
{
    protected override IPAddress CallerAddress => IPAddress.Parse("10.0.0.4");

    protected override IDictionary<string, string?> Settings => new Dictionary<string, string?>
    {
        ["ForwardedHeaders:KnownNetworks:0"] = "10.0.0.0/8",
    };
}

/// <summary>
/// Stand-in for External ID tokens. A request with X-Test-User signs in as that user, with the scopes in
/// X-Test-Scopes (default: the app's scope) and the email in X-Test-Email. No header means anonymous.
/// </summary>
public static class TestAuth
{
    public const string Scheme = "Test";
    public const string UserHeader = "X-Test-User";
    public const string ScopesHeader = "X-Test-Scopes";
    public const string EmailHeader = "X-Test-Email";

    public static HttpClient As(this HttpClient client, string subject, string? email = null, string? scopes = null)
    {
        ArgumentNullException.ThrowIfNull(client);
        client.DefaultRequestHeaders.Remove(UserHeader);
        client.DefaultRequestHeaders.Add(UserHeader, subject);
        if (email is not null)
        {
            client.DefaultRequestHeaders.Add(EmailHeader, email);
        }

        if (scopes is not null)
        {
            client.DefaultRequestHeaders.Add(ScopesHeader, scopes);
        }

        return client;
    }
}

internal sealed class TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(TestAuth.UserHeader, out var subject) || string.IsNullOrWhiteSpace(subject))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var scopes = Request.Headers.TryGetValue(TestAuth.ScopesHeader, out var s) ? s.ToString() : "Plans.ReadWrite";
        List<Claim> claims = [new("oid", subject.ToString()), new("scp", scopes)];
        if (Request.Headers.TryGetValue(TestAuth.EmailHeader, out var email))
        {
            claims.Add(new Claim("email", email.ToString()));
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, TestAuth.Scheme));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, TestAuth.Scheme)));
    }
}
