using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using StartLine.API.Infrastructure;

namespace StartLine.Integration.Tests;

public sealed class StartupAndErrorTests
{
    private sealed class BadCatalogueFactory(string slug, string distance) : StartLineApiFactory
    {
        // Appended after the four configured races.
        protected override IDictionary<string, string?> Settings => new Dictionary<string, string?>
        {
            ["RaceCatalogue:Races:4:Slug"] = slug,
            ["RaceCatalogue:Races:4:Name"] = "Broken entry",
            ["RaceCatalogue:Races:4:Date"] = "2027-07-01",
            ["RaceCatalogue:Races:4:DistanceKm"] = distance,
        };
    }

    [Theory]
    [InlineData("comrades-2027 ", "90", "used more than once")]
    [InlineData("nan-race", "NaN", "invalid distance")]
    public void A_bad_race_entry_stops_the_app_at_boot(string slug, string distance, string expected)
    {
        using var factory = new BadCatalogueFactory(slug, distance);

        var error = Should.Throw<Exception>(() => factory.CreateClient());

        error.ToString().ShouldContain(expected);
    }

    private sealed class RecordingProblemDetails : IProblemDetailsService
    {
        public bool Wrote { get; private set; }

        public ValueTask WriteAsync(ProblemDetailsContext context)
        {
            Wrote = true;
            return ValueTask.CompletedTask;
        }
    }

    [Fact]
    public async Task A_client_hanging_up_is_not_reported_as_a_server_error()
    {
        var problems = new RecordingProblemDetails();
        var handler = new ProblemDetailsExceptionHandler(problems, NullLogger<ProblemDetailsExceptionHandler>.Instance);
        using var aborted = new CancellationTokenSource();
        await aborted.CancelAsync();
        var context = new DefaultHttpContext { RequestAborted = aborted.Token };

        var handled = await handler.TryHandleAsync(context, new OperationCanceledException(), CancellationToken.None);

        handled.ShouldBeTrue();
        context.Response.StatusCode.ShouldBe(499);
        problems.Wrote.ShouldBeFalse();
    }
}
