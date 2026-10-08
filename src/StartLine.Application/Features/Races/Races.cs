using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Domain.Races;

namespace StartLine.Application.Features.Races;

/// <summary>Reads the current race calendar.</summary>
public interface IRaceCatalogue
{
    IReadOnlyList<Race> All();

    Race? FindBySlug(string slug);
}

/// <summary>Holds the reconciled race calendar between syncs.</summary>
public interface IRaceStore
{
    DateTimeOffset? LastSynced { get; }

    void Replace(IReadOnlyList<Race> races, DateTimeOffset syncedAt);
}

/// <summary>
/// Somewhere race dates come from: the organiser, a federation, a calendar site or the curated list.
/// Adding a source means writing one of these; nothing else changes.
/// </summary>
public interface IRaceSource
{
    string Name { get; }

    Task<IReadOnlyList<RaceObservation>> FetchAsync(CancellationToken cancellationToken);
}

public sealed record RaceDto(
    string Slug,
    string Name,
    DateOnly Date,
    double DistanceKm,
    string Location,
    string Summary,
    Uri? Website,
    DateStatus DateStatus,
    bool DistanceConfirmed)
{
    public static RaceDto From(Race race)
    {
        ArgumentNullException.ThrowIfNull(race);
        return new(race.Slug, race.Name, race.Date, race.Distance.Kilometres, race.Location, race.Summary, race.Website,
            race.DateStatus, race.DistanceConfirmed);
    }
}

public sealed record ListUpcomingRacesQuery : IRequest<IReadOnlyList<RaceDto>>;

internal sealed class ListUpcomingRacesHandler(IRaceCatalogue catalogue, TimeProvider timeProvider)
    : IRequestHandler<ListUpcomingRacesQuery, IReadOnlyList<RaceDto>>
{
    public Task<IReadOnlyList<RaceDto>> Handle(ListUpcomingRacesQuery request, CancellationToken cancellationToken)
    {
        var today = timeProvider.Today();
        IReadOnlyList<RaceDto> races = [.. catalogue.All()
            .Where(r => r.Date > today)
            .OrderBy(r => r.Date)
            .Select(RaceDto.From)];
        return Task.FromResult(races);
    }
}
