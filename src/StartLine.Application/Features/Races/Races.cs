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
    bool DistanceConfirmed,
    bool Major)
{
    public static RaceDto From(Race race)
    {
        ArgumentNullException.ThrowIfNull(race);
        return new(race.Slug, race.Name, race.Date, race.Distance.Kilometres, race.Location, race.Summary, race.Website,
            race.DateStatus, race.DistanceConfirmed, race.Major);
    }
}

/// <summary>The headline races shown on the race step, soonest first. Every other race is found by searching.</summary>
public sealed record ListUpcomingRacesQuery : IRequest<IReadOnlyList<RaceDto>>;

internal sealed class ListUpcomingRacesHandler(IRaceCatalogue catalogue, TimeProvider timeProvider)
    : IRequestHandler<ListUpcomingRacesQuery, IReadOnlyList<RaceDto>>
{
    public Task<IReadOnlyList<RaceDto>> Handle(ListUpcomingRacesQuery request, CancellationToken cancellationToken)
    {
        var today = timeProvider.Today();
        IReadOnlyList<RaceDto> races = [.. catalogue.All()
            .Where(r => r.Major && r.Date > today)
            .OrderBy(r => r.Date)
            .Select(RaceDto.From)];
        return Task.FromResult(races);
    }
}

/// <summary>Upcoming races whose name or place matches the text, headline races included.</summary>
public sealed record SearchRacesQuery(string Text, int Limit = SearchRacesQuery.DefaultLimit) : IRequest<IReadOnlyList<RaceDto>>
{
    public const int DefaultLimit = 20;
    public const int MinimumLength = 2;
}

internal sealed class SearchRacesHandler(IRaceCatalogue catalogue, TimeProvider timeProvider)
    : IRequestHandler<SearchRacesQuery, IReadOnlyList<RaceDto>>
{
    public Task<IReadOnlyList<RaceDto>> Handle(SearchRacesQuery request, CancellationToken cancellationToken)
    {
        var words = RaceText.Words(request.Text);
        if (string.Join("", words).Length < SearchRacesQuery.MinimumLength)
        {
            return Task.FromResult<IReadOnlyList<RaceDto>>([]);
        }

        var today = timeProvider.Today();
        var limit = Math.Clamp(request.Limit, 1, 50);
        IReadOnlyList<RaceDto> races = [.. catalogue.All()
            .Where(r => r.Date > today)
            .Select(r => (Race: r, Name: RaceText.Normalise(r.Name), Place: RaceText.Normalise(r.Location)))
            .Where(r => words.All(w => r.Name.Contains(w, StringComparison.Ordinal) || r.Place.Contains(w, StringComparison.Ordinal)))
            // Names that start with what was typed come first, then the soonest.
            .OrderByDescending(r => r.Name.StartsWith(words[0], StringComparison.Ordinal))
            .ThenBy(r => r.Race.Date)
            .Take(limit)
            .Select(r => RaceDto.From(r.Race))];
        return Task.FromResult(races);
    }
}

/// <summary>One race by its slug, so a plan for a searched-for race can open again.</summary>
public sealed record GetRaceQuery(string Slug) : IRequest<RaceDto?>;

internal sealed class GetRaceHandler(IRaceCatalogue catalogue) : IRequestHandler<GetRaceQuery, RaceDto?>
{
    public Task<RaceDto?> Handle(GetRaceQuery request, CancellationToken cancellationToken) =>
        Task.FromResult(catalogue.FindBySlug(request.Slug) is { } race ? RaceDto.From(race) : null);
}

/// <summary>Matching that ignores case, accents and punctuation: "durban" finds "Durban", "ome" finds "Omé".</summary>
internal static class RaceText
{
    public static string Normalise(string text)
    {
        var decomposed = (text ?? "").Normalize(System.Text.NormalizationForm.FormD);
        var kept = new System.Text.StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            kept.Append(char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : ' ');
        }

        return kept.ToString();
    }

    public static string[] Words(string text) =>
        Normalise(text).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
