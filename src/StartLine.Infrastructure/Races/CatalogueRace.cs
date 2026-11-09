using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace StartLine.Infrastructure.Races;

/// <summary>
/// A race in the searchable catalogue: the long tail beyond the headline races in configuration. Rows are added with
/// SQL or a data migration (see docs/races.md); each one joins the calendar on the next sync. Set Major to show a race
/// on the race step alongside the curated ones.
/// </summary>
public sealed class CatalogueRace
{
    public int Id { get; set; }

    public string Slug { get; set; } = "";

    public string Name { get; set; } = "";

    public DateOnly Date { get; set; }

    public double DistanceKm { get; set; }

    public string Location { get; set; } = "";

    public string Summary { get; set; } = "";

    public string? Website { get; set; }

    /// <summary>The organiser has announced this date. False for dates seen only on calendar sites.</summary>
    public bool DateConfirmed { get; set; }

    /// <summary>Where the date was checked, for whoever maintains the list.</summary>
    public string? DateSource { get; set; }

    public bool DistanceConfirmed { get; set; } = true;

    public bool Major { get; set; }
}

internal sealed class CatalogueRaceConfiguration : IEntityTypeConfiguration<CatalogueRace>
{
    public void Configure(EntityTypeBuilder<CatalogueRace> builder)
    {
        builder.ToTable("CatalogueRaces");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Slug).HasMaxLength(120).IsRequired();
        builder.HasIndex(r => r.Slug).IsUnique();
        builder.Property(r => r.Name).HasMaxLength(120).IsRequired();
        builder.Property(r => r.Location).HasMaxLength(120).IsRequired();
        builder.Property(r => r.Summary).HasMaxLength(300).IsRequired();
        builder.Property(r => r.Website).HasMaxLength(300);
        builder.Property(r => r.DateSource).HasMaxLength(500);
    }
}
