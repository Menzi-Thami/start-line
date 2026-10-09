using Microsoft.Extensions.Options;
using StartLine.Application.Features.Races;
using StartLine.Domain.Races;

namespace StartLine.Infrastructure.Races;

/// <summary>The curated list from configuration, as a race source.</summary>
internal sealed class ConfiguredRaceSource : IRaceSource
{
    private readonly IReadOnlyList<RaceObservation> _observations;

    // Reading the options here, not on first fetch, means a bad entry stops the app at boot instead
    // of being caught as one source's failure and silently publishing an empty calendar.
    public ConfiguredRaceSource(IOptions<RaceCatalogueOptions> options)
    {
        var value = options.Value;
        _observations = [.. value.Races.Select(r => new RaceObservation(
            Name,
            value.Priority,
            r.Slug.Trim(),
            r.Name,
            r.Date,
            r.DistanceKm,
            r.DistanceConfirmed,
            r.DateConfirmed,
            r.Location,
            r.Summary,
            r.Website))];
    }

    public string Name => "Curated list";

    public Task<IReadOnlyList<RaceObservation>> FetchAsync(CancellationToken cancellationToken) => Task.FromResult(_observations);
}
