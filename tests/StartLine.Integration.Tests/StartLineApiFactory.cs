using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;

namespace StartLine.Integration.Tests;

/// <summary>The real pipeline and real race catalogue, with the clock pinned so dates in assertions never drift.</summary>
public class StartLineApiFactory : WebApplicationFactory<Program>
{
    public static readonly DateTimeOffset Now = new(2026, 10, 8, 9, 0, 0, TimeSpan.Zero);

    /// <summary>The address every test request appears to come from. The test server leaves it empty otherwise.</summary>
    protected virtual IPAddress CallerAddress => IPAddress.Parse("198.51.100.7");

    protected virtual IDictionary<string, string?> Settings => new Dictionary<string, string?>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(Settings));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new FakeTimeProvider(Now));
            services.AddSingleton<IStartupFilter>(new CallerAddressFilter(CallerAddress));
        });
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
