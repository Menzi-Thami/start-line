using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Predictions;
using StartLine.Application.Features.Races;

namespace StartLine.Application.Tests.Common;

/// <summary>Proves validation really runs inside the dispatcher, not just in isolated validator tests.</summary>
public sealed class DispatcherPipelineTests
{
    private static IDispatcher Dispatcher()
    {
        // Everything AddApplication needs from the outer layers, so ValidateOnBuild passes as it does in the real host.
        var services = new ServiceCollection()
            .AddApplication()
            .AddSingleton<TimeProvider>(new FakeTimeProvider(TestRaces.Now))
            .AddSingleton(TestRaces.Catalogue())
            .AddSingleton(Substitute.For<IRaceStore>())
            .AddScoped(_ => Substitute.For<IApplicationDbContext>())
            .AddScoped(_ => Substitute.For<ICurrentUser>())
            .AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true, ValidateOnBuild = true })
            .CreateScope().ServiceProvider.GetRequiredService<IDispatcher>();
    }

    [Fact]
    public async Task An_invalid_request_never_reaches_its_handler()
    {
        var invalid = new GeneratePlanQuery(null, null, null, null, TimeSpan.Zero, [DayOfWeek.Sunday], DayOfWeek.Sunday, null);

        var exception = await Should.ThrowAsync<ValidationException>(() => Dispatcher().Send(invalid));

        exception.Errors.Keys.ShouldBe(["DistanceKm", "RaceDate", "RunDays"], ignoreOrder: true);
    }

    [Fact]
    public async Task A_valid_request_is_handled()
    {
        var prediction = await Dispatcher().Send(new PredictRaceTimeQuery(5, TimeSpan.FromMinutes(25), 10));

        prediction.PredictedTime.ShouldBeGreaterThan(TimeSpan.FromMinutes(50));
    }
}
