using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using StartLine.Application.Features.Races;
using StartLine.Domain.Races;
using StartLine.Infrastructure.Persistence;

namespace StartLine.Infrastructure.Races;

/// <summary>
/// The searchable races kept in the database. Below the curated list in priority, so a race in both keeps its curated
/// details. If the database can't be reached, the sync keeps this source's last good list (or none) and the curated
/// races still publish.
/// </summary>
internal sealed class DatabaseRaceSource(IServiceScopeFactory scopes) : IRaceSource
{
    public const int Priority = 5;

    public string Name => "Race database";

    public async Task<IReadOnlyList<RaceObservation>> FetchAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StartLineDbContext>();
        var rows = await db.CatalogueRaces.AsNoTracking().ToListAsync(cancellationToken);
        return
        [
            .. rows.Select(r => new RaceObservation(
                Name,
                Priority,
                r.Slug.Trim(),
                r.Name,
                r.Date,
                r.DistanceKm,
                r.DistanceConfirmed,
                r.DateConfirmed,
                r.Location,
                r.Summary,
                Uri.TryCreate(r.Website, UriKind.Absolute, out var website) ? website : null,
                r.Major)),
        ];
    }
}
