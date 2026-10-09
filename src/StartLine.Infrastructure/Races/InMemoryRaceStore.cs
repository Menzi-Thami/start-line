using StartLine.Application.Features.Races;
using StartLine.Domain.Races;

namespace StartLine.Infrastructure.Races;

/// <summary>
/// The published calendar, swapped as a whole on each sync so readers never see a half-updated list.
/// Every instance rebuilds it from the sources on startup, so nothing needs persisting yet.
/// </summary>
internal sealed class InMemoryRaceStore : IRaceCatalogue, IRaceStore
{
    private sealed record Snapshot(IReadOnlyList<Race> Races, Dictionary<string, Race> BySlug, DateTimeOffset? SyncedAt);

    private volatile Snapshot _current = new([], new Dictionary<string, Race>(StringComparer.OrdinalIgnoreCase), null);

    public DateTimeOffset? LastSynced => _current.SyncedAt;

    public IReadOnlyList<Race> All() => _current.Races;

    public Race? FindBySlug(string slug) => _current.BySlug.GetValueOrDefault(slug.Trim());

    public void Replace(IReadOnlyList<Race> races, DateTimeOffset syncedAt)
    {
        ArgumentNullException.ThrowIfNull(races);
        _current = new Snapshot(races, races.ToDictionary(r => r.Slug, StringComparer.OrdinalIgnoreCase), syncedAt);
    }
}
