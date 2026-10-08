using Microsoft.Extensions.Options;
using StartLine.Domain.Running;

namespace StartLine.Infrastructure.Races;

/// <summary>The hand-curated race list: one source among many, and a fallback when online sources are down.</summary>
public sealed class RaceCatalogueOptions
{
    public const string Section = "RaceCatalogue";

    /// <summary>Low by default so any real source (organiser, federation) overrides a stale curated entry.</summary>
    public int Priority { get; set; } = 10;

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

        /// <summary>The organiser has announced this date. Leave false for dates seen only on calendar sites.</summary>
        public bool DateConfirmed { get; set; }

        /// <summary>False while the official distance is still being measured.</summary>
        public bool DistanceConfirmed { get; set; } = true;
    }
}

public sealed class RaceCalendarOptions
{
    public const string Section = "RaceCalendar";

    public TimeSpan SyncInterval { get; set; } = TimeSpan.FromHours(6);
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

            if (!double.IsFinite(race.DistanceKm) || race.DistanceKm is <= 0 or > Distance.MaxKilometres)
            {
                failures.Add($"Race '{race.Slug}' has an invalid distance.");
            }

            if (race.Date == default)
            {
                failures.Add($"Race '{race.Slug}' has no date.");
            }
        }

        failures.AddRange(options.Races
            .GroupBy(r => r.Slug.Trim(), StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => $"Race slug '{g.Key}' is used more than once."));

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }
}

internal sealed class RaceCalendarOptionsValidator : IValidateOptions<RaceCalendarOptions>
{
    public ValidateOptionsResult Validate(string? name, RaceCalendarOptions options) =>
        options.SyncInterval >= TimeSpan.FromMinutes(5)
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail("RaceCalendar:SyncInterval must be at least five minutes; race dates don't change that fast.");
}
