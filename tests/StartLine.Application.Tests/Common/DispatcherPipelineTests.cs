using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Common.Dispatcher;
using StartLine.Application.Common.Exceptions;
using StartLine.Application.Features.Plans;
using StartLine.Application.Features.Predictions;

namespace StartLine.Application.Tests.Common;

/// <summary>Proves validation really runs inside the dispatcher, not just in isolated validator tests.</summary>
public sealed class DispatcherPipelineTests
{
    private static IDispatcher Dispatcher()
    {
        var services = new ServiceCollection()
            .AddApplication()
            .AddSingleton<TimeProvider>(new FakeTimeProvider(TestRaces.Now))
            .AddSingleton(TestRaces.Catalogue());
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
