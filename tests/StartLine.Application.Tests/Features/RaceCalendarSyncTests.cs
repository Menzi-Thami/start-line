using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;
using StartLine.Application.Features.Races;
using StartLine.Domain.Races;

namespace StartLine.Application.Tests.Features;

public sealed class RaceCalendarSyncTests
{
    private readonly FakeTimeProvider _time = new(TestRaces.Now);
    private readonly RecordingStore _store = new();

    private sealed class RecordingStore : IRaceStore
    {
        public IReadOnlyList<Race>? Races { get; private set; }
        public int Replacements { get; private set; }
        public DateTimeOffset? LastSynced { get; private set; }

        public void Replace(IReadOnlyList<Race> races, DateTimeOffset syncedAt)
        {
            Races = races;
            LastSynced = syncedAt;
            Replacements++;
        }
    }

    /// <summary>A source whose behaviour each test scripts: return races, throw, or hang.</summary>
    private sealed class ScriptedSource(string name) : IRaceSource
    {
        public Func<CancellationToken, Task<IReadOnlyList<RaceObservation>>> Next { get; set; } =
            _ => Task.FromResult<IReadOnlyList<RaceObservation>>([]);

        public string Name { get; } = name;

        public Task<IReadOnlyList<RaceObservation>> FetchAsync(CancellationToken cancellationToken) => Next(cancellationToken);

        public static Func<CancellationToken, Task<IReadOnlyList<RaceObservation>>> Returns(params RaceObservation[] races) =>
            _ => Task.FromResult<IReadOnlyList<RaceObservation>>(races);

        public static Func<CancellationToken, Task<IReadOnlyList<RaceObservation>>> Throws() =>
            _ => throw new HttpRequestException("Source is down");

        public static Func<CancellationToken, Task<IReadOnlyList<RaceObservation>>> Hangs() =>
            async token =>
            {
                await Task.Delay(Timeout.Infinite, token);
                return [];
            };
    }

    private static RaceObservation Comrades(string source, int priority, DateOnly date) =>
        new(source, priority, "comrades-2027", "Comrades Marathon", date, 90, false, priority >= 100, "Durban", "", null);

    private static RaceObservation TwoOceans(string source) =>
        new(source, 10, "two-oceans-2027", "Two Oceans", new DateOnly(2027, 4, 4), 56, true, false, "Cape Town", "", null);

    private RaceCalendarSync Sync(params IRaceSource[] sources) =>
        new(sources, _store, _time, NullLogger<RaceCalendarSync>.Instance);

    [Fact]
    public async Task Publishes_the_reconciled_calendar_from_every_source()
    {
        var organiser = new ScriptedSource("organiser") { Next = ScriptedSource.Returns(Comrades("organiser", 100, new(2027, 6, 13))) };
        var calendar = new ScriptedSource("calendar")
        {
            Next = ScriptedSource.Returns(Comrades("calendar", 10, new(2027, 6, 11)), TwoOceans("calendar")),
        };

        var result = await Sync(organiser, calendar).RunAsync(CancellationToken.None);

        result.StoreUpdated.ShouldBeTrue();
        _store.Races!.Select(r => r.Slug).ShouldBe(["two-oceans-2027", "comrades-2027"]);
        _store.Races!.Single(r => r.Slug == "comrades-2027").Date.ShouldBe(new DateOnly(2027, 6, 13));
        _store.LastSynced.ShouldBe(TestRaces.Now);
    }

    [Fact]
    public async Task A_failing_source_keeps_its_last_good_races_instead_of_deleting_them()
    {
        var calendar = new ScriptedSource("calendar") { Next = ScriptedSource.Returns(TwoOceans("calendar")) };
        var sync = Sync(calendar);
        await sync.RunAsync(CancellationToken.None);

        calendar.Next = ScriptedSource.Throws();
        var result = await sync.RunAsync(CancellationToken.None);

        result.FailedSources.ShouldBe(["calendar"]);
        _store.Races!.Single().Slug.ShouldBe("two-oceans-2027");
    }

    [Fact]
    public async Task One_source_failing_does_not_stop_the_others_publishing()
    {
        var down = new ScriptedSource("down") { Next = ScriptedSource.Throws() };
        var up = new ScriptedSource("up") { Next = ScriptedSource.Returns(TwoOceans("up")) };

        var result = await Sync(down, up).RunAsync(CancellationToken.None);

        result.FailedSources.ShouldBe(["down"]);
        _store.Races!.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Leaves_the_store_alone_until_some_source_has_ever_succeeded()
    {
        var down = new ScriptedSource("down") { Next = ScriptedSource.Throws() };

        var result = await Sync(down).RunAsync(CancellationToken.None);

        result.StoreUpdated.ShouldBeFalse();
        _store.Replacements.ShouldBe(0);
    }

    [Fact]
    public async Task A_slow_source_is_cut_off_without_holding_up_the_calendar()
    {
        var slow = new ScriptedSource("slow") { Next = ScriptedSource.Hangs() };
        var fast = new ScriptedSource("fast") { Next = ScriptedSource.Returns(TwoOceans("fast")) };

        var running = Sync(slow, fast).RunAsync(CancellationToken.None);
        _time.Advance(RaceCalendarSync.SourceTimeout + TimeSpan.FromSeconds(1));
        var result = await running.WaitAsync(TimeSpan.FromSeconds(10));

        result.FailedSources.ShouldBe(["slow"]);
        _store.Races!.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Shutting_down_cancels_the_run_rather_than_being_treated_as_a_source_failure()
    {
        var slow = new ScriptedSource("slow") { Next = ScriptedSource.Hangs() };
        using var shutdown = new CancellationTokenSource();

        var running = Sync(slow).RunAsync(shutdown.Token);
        await shutdown.CancelAsync();

        await Should.ThrowAsync<OperationCanceledException>(() => running);
    }
}
