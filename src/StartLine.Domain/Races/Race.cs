using StartLine.Domain.Running;

namespace StartLine.Domain.Races;

public enum DateStatus
{
    /// <summary>Announced by the organiser, or reported identically by several sources with none disagreeing.</summary>
    Confirmed,

    /// <summary>Expected but not yet confirmed: one secondary source, or sources that disagree.</summary>
    Provisional,
}

public sealed record Race(
    string Slug,
    string Name,
    DateOnly Date,
    Distance Distance,
    string Location,
    string Summary,
    Uri? Website,
    DateStatus DateStatus = DateStatus.Confirmed,
    bool DistanceConfirmed = true,
    IReadOnlyList<string>? Sources = null);
