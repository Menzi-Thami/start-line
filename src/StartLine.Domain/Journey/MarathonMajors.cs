using System.Globalization;

namespace StartLine.Domain.Journey;

public enum MarathonMajor { Tokyo, Boston, London, Berlin, Chicago, NewYork, Sydney, CapeTown }

public enum RaceTimeKind { Unspecified, OfficialChip, RecordedElapsed }

public sealed record MarathonMajorDefinition(MarathonMajor Id, string Name, string City, bool OriginalSix, int? FirstQualifyingYear);

/// <summary>A maintained event collection, separate from the calendar's "featured race" flag. Not official star verification.</summary>
public static class MarathonMajors
{
    // Membership and Sydney/Cape Town eligibility checked against worldmarathonmajors.com on 15 November 2026.
    // The Sydney 2024 age-group championship exception needs official verification and is not inferred here.
    public static IReadOnlyList<MarathonMajorDefinition> All { get; } = Array.AsReadOnly(new[]
    {
        new MarathonMajorDefinition(MarathonMajor.Tokyo, "Tokyo Marathon", "Tokyo", true, null),
        new MarathonMajorDefinition(MarathonMajor.Boston, "Boston Marathon", "Boston", true, null),
        new MarathonMajorDefinition(MarathonMajor.London, "London Marathon", "London", true, null),
        new MarathonMajorDefinition(MarathonMajor.Berlin, "Berlin Marathon", "Berlin", true, null),
        new MarathonMajorDefinition(MarathonMajor.Chicago, "Chicago Marathon", "Chicago", true, null),
        new MarathonMajorDefinition(MarathonMajor.NewYork, "New York City Marathon", "New York", true, null),
        new MarathonMajorDefinition(MarathonMajor.Sydney, "Sydney Marathon", "Sydney", false, 2025),
        new MarathonMajorDefinition(MarathonMajor.CapeTown, "Cape Town Marathon", "Cape Town", false, 2026),
    });

    public static bool IsMarathon(double km) => double.IsFinite(km) && Math.Abs(km - 42.195) <= .1;

    public static bool Qualifies(MarathonMajor? major, DateOnly date) =>
        major is { } id && All.FirstOrDefault(m => m.Id == id) is { } definition
        && (definition.FirstQualifyingYear is not { } year || date.Year >= year);

    /// <summary>Exact event aliases only: a city name, a half marathon or a catalogue headline flag proves nothing.</summary>
    public static MarathonMajor? Recognise(string name, double distanceKm)
    {
        if (!IsMarathon(distanceKm)) return null;
        var normal = name.Trim().Replace("-", " ", StringComparison.Ordinal).ToUpperInvariant();
        return normal switch
        {
            "TOKYO MARATHON" => MarathonMajor.Tokyo,
            "BOSTON MARATHON" or "BOSTON MARATHON PRESENTED BY BANK OF AMERICA" => MarathonMajor.Boston,
            "LONDON MARATHON" or "TCS LONDON MARATHON" or "VIRGIN MONEY LONDON MARATHON" => MarathonMajor.London,
            "BERLIN MARATHON" or "BMW BERLIN MARATHON" or "GENERALI BERLIN MARATHON" => MarathonMajor.Berlin,
            "CHICAGO MARATHON" or "BANK OF AMERICA CHICAGO MARATHON" => MarathonMajor.Chicago,
            "NEW YORK CITY MARATHON" or "TCS NEW YORK CITY MARATHON" => MarathonMajor.NewYork,
            "SYDNEY MARATHON" or "TCS SYDNEY MARATHON" or "TCS SYDNEY MARATHON PRESENTED BY ASICS" => MarathonMajor.Sydney,
            "CAPE TOWN MARATHON" or "SANLAM CAPE TOWN MARATHON" => MarathonMajor.CapeTown,
            _ => null,
        };
    }

    public static string RaceKey(string name, double distanceKm, DateOnly date, MarathonMajor? major) =>
        string.Create(CultureInfo.InvariantCulture, $"{date:yyyy-MM-dd}|{(major is { } id ? $"major:{id}" : name.Trim().ToLowerInvariant())}|{(major is null ? distanceKm : 42.195):F3}");
}
