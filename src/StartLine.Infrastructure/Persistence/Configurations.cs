using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;

namespace StartLine.Infrastructure.Persistence;

internal sealed class RunnerConfiguration : IEntityTypeConfiguration<Runner>
{
    public void Configure(EntityTypeBuilder<Runner> builder)
    {
        builder.ToTable("Runners");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).ValueGeneratedNever();
        builder.Property(r => r.IdentitySubject).HasMaxLength(128).IsRequired();
        builder.HasIndex(r => r.IdentitySubject).IsUnique();
        builder.Property(r => r.Email).HasMaxLength(Runner.MaxEmailLength);
        builder.Property(r => r.DisplayName).HasMaxLength(Runner.MaxNameLength).IsRequired();
        builder.Property(r => r.TimeZone).HasMaxLength(Runner.MaxTimeZoneLength).IsRequired();
        builder.Property(r => r.Units).HasConversion<string>().HasMaxLength(16);
        builder.Property(r => r.PrivacyNoticeVersion).HasMaxLength(32).IsRequired();
        builder.HasMany<SavedPlan>().WithOne().HasForeignKey(p => p.RunnerId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class SavedPlanConfiguration : IEntityTypeConfiguration<SavedPlan>
{
    // Days are stored as a 7-bit mask: compact, and one column instead of a child table.
    private static readonly ValueConverter<IReadOnlyList<DayOfWeek>, int> DaysAsMask = new(
        days => days.Aggregate(0, (mask, day) => mask | (1 << (int)day)),
        mask => Enumerable.Range(0, 7).Where(bit => (mask & (1 << bit)) != 0).Select(bit => (DayOfWeek)bit).ToList());

    private static readonly ValueComparer<IReadOnlyList<DayOfWeek>> DaysComparer = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        days => days.Aggregate(0, (hash, day) => HashCode.Combine(hash, day)),
        days => days.ToList());

    public void Configure(EntityTypeBuilder<SavedPlan> builder)
    {
        builder.ToTable("SavedPlans");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).ValueGeneratedNever();
        builder.Property(p => p.Name).HasMaxLength(SavedPlan.MaxNameLength).IsRequired();
        builder.Property(p => p.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(p => p.Version).IsRowVersion();
        builder.HasIndex(p => new { p.RunnerId, p.Status, p.UpdatedAt });

        builder.ComplexProperty(p => p.Inputs, inputs =>
        {
            inputs.Property(i => i.RaceSlug).HasColumnName("RaceSlug").HasMaxLength(100);
            inputs.Property(i => i.RaceName).HasColumnName("RaceName").HasMaxLength(100);
            inputs.Property(i => i.DistanceKm).HasColumnName("DistanceKm");
            inputs.Property(i => i.RaceDate).HasColumnName("RaceDate");
            // SQL `time` stops at 24 hours; ultra goals don't, so goals are stored as seconds.
            inputs.Property(i => i.GoalTime).HasColumnName("GoalSeconds")
                .HasConversion(t => (long)t.TotalSeconds, s => TimeSpan.FromSeconds(s));
            inputs.Property(i => i.RunDays).HasColumnName("RunDays").HasConversion(DaysAsMask, DaysComparer);
            inputs.Property(i => i.LongRunDay).HasColumnName("LongRunDay").HasConversion<string>().HasMaxLength(16);
            inputs.Property(i => i.CurrentWeeklyKm).HasColumnName("CurrentWeeklyKm");
            inputs.Property(i => i.Experience).HasColumnName("Experience").HasConversion<string>().HasMaxLength(16);
            inputs.Property(i => i.StrengthDays).HasColumnName("StrengthDays").HasConversion(DaysAsMask, DaysComparer);
            inputs.Property(i => i.PlanFrom).HasColumnName("PlanFrom");
        });
    }
}
