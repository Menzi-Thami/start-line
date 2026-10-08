using Microsoft.Extensions.Options;
using StartLine.Application.Features.Races;
using StartLine.Domain.Races;
using StartLine.Domain.Running;

namespace StartLine.Infrastructure.Races;

public sealed class RaceCatalogueOptions
{
    public const string Section = "RaceCatalogue";

    public IList<RaceEntry> Races { get; } = [];

    public sealed class RaceEntry
    {
        public string Slug { get; set; } = "";
        public string Name { get; set; } = "";
        public DateOnly Date { get; set; }
        public double DistanceKm { get; set; }
        public string Location { get; set; } = "";
        public string Summary { get; set; } = "";
        public Uri? Website { get; set; }
    }
}

internal sealed class RaceCatalogueOptionsValidator : IValidateOptions<RaceCatalogueOptions>
{
    public ValidateOptionsResult Validate(string? name, RaceCatalogueOptions options)
    {
        var failures = new List<string>();
        foreach (var (race, index) in options.Races.Select((r, i) => (r, i)))
        {
            if (string.IsNullOrWhiteSpace(race.Slug) || string.IsNullOrWhiteSpace(race.Name))
            {
                failures.Add($"Race {index} needs a slug and a name.");
            }

            if (race.DistanceKm is <= 0 or > Distance.MaxKilometres)
            {
                failures.Add($"Race '{race.Slug}' has an invalid distance.");
            }

            if (race.Date == default)
            {
                failures.Add($"Race '{race.Slug}' has no date.");
            }
        }

        failures.AddRange(options.Races
            .GroupBy(r => r.Slug, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => $"Race slug '{g.Key}' is used more than once."));

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }
}

internal sealed class ConfiguredRaceCatalogue : IRaceCatalogue
{
    private readonly IReadOnlyList<Race> _races;
    private readonly Dictionary<string, Race> _bySlug;

    public ConfiguredRaceCatalogue(IOptions<RaceCatalogueOptions> options)
    {
        _races = [.. options.Value.Races.Select(r => new Race(
            r.Slug.Trim(),
            r.Name,
            r.Date,
            Distance.FromKilometres(r.DistanceKm),
            r.Location,
            r.Summary,
            r.Website))];
        _bySlug = _races.ToDictionary(r => r.Slug, StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyList<Race> All() => _races;

    public Race? FindBySlug(string slug) => _bySlug.GetValueOrDefault(slug.Trim());
}
