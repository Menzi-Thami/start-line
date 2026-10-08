using StartLine.Domain.Running;

namespace StartLine.Domain.Races;

/// <summary>What one source says about one race.</summary>
/// <param name="Priority">Higher wins when sources disagree.</param>
/// <param name="DateConfirmedByOrganiser">The source is the organiser, or quotes the organiser's own announcement.</param>
public sealed record RaceObservation(
    string Source,
    int Priority,
    string Slug,
    string Name,
    DateOnly Date,
    double DistanceKm,
    bool DistanceConfirmed,
    bool DateConfirmedByOrganiser,
    string Location,
    string Summary,
    Uri? Website);

/// <summary>
/// Merges every source's view of the race calendar into one list, fully automatically: the highest
/// priority source wins each race, and the race says how sure it is. A date is confirmed when it comes
/// from the organiser, or when at least two sources agree on it and none disagree.
/// </summary>
public static class RaceReconciler
{
    public static IReadOnlyList<Race> Reconcile(IEnumerable<RaceObservation> observations)
    {
        ArgumentNullException.ThrowIfNull(observations);

        return
        [
            .. observations
                .Where(IsUsable)
                .GroupBy(o => o.Slug.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(Merge)
                .OrderBy(r => r.Date)
                .ThenBy(r => r.Name, StringComparer.Ordinal),
        ];
    }

    // One bad row from one source must not take down the whole calendar.
    private static bool IsUsable(RaceObservation o) =>
        !string.IsNullOrWhiteSpace(o.Slug)
        && !string.IsNullOrWhiteSpace(o.Name)
        && double.IsFinite(o.DistanceKm)
        && o.DistanceKm is > 0 and <= Distance.MaxKilometres;

    private static Race Merge(IGrouping<string, RaceObservation> group)
    {
        var ranked = group
            .OrderByDescending(o => o.Priority)
            .ThenByDescending(o => o.DateConfirmedByOrganiser)
            .ThenBy(o => o.Source, StringComparer.Ordinal)
            .ToList();
        var winner = ranked[0];

        var agreeing = ranked.Count(o => o.Date == winner.Date);
        var disagreeing = ranked.Count - agreeing;
        var confirmed = winner.DateConfirmedByOrganiser || (agreeing >= 2 && disagreeing == 0);

        string FirstNonBlank(Func<RaceObservation, string> field) =>
            ranked.Select(field).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? "";

        return new Race(
            group.Key,
            winner.Name.Trim(),
            winner.Date,
            Distance.FromKilometres(winner.DistanceKm),
            FirstNonBlank(o => o.Location),
            FirstNonBlank(o => o.Summary),
            ranked.Select(o => o.Website).FirstOrDefault(w => w is not null),
            confirmed ? DateStatus.Confirmed : DateStatus.Provisional,
            winner.DistanceConfirmed,
            [.. ranked.Select(o => o.Source).Distinct(StringComparer.Ordinal)]);
    }
}
