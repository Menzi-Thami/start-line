using StartLine.Domain.Running;

namespace StartLine.Domain.Races;

public sealed record Race(
    string Slug,
    string Name,
    DateOnly Date,
    Distance Distance,
    string Location,
    string Summary,
    Uri? Website);
