using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Domain.Races;

namespace StartLine.Application.Features.Races;

public interface IRaceCatalogue
{
    IReadOnlyList<Race> All();

    Race? FindBySlug(string slug);
}

public sealed record RaceDto(
    string Slug,
    string Name,
    DateOnly Date,
    double DistanceKm,
    string Location,
    string Summary,
    Uri? Website)
{
    public static RaceDto From(Race race)
    {
        ArgumentNullException.ThrowIfNull(race);
        return new(race.Slug, race.Name, race.Date, race.Distance.Kilometres, race.Location, race.Summary, race.Website);
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
