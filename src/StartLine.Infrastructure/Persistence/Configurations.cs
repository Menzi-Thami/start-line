using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using StartLine.Domain.Activities;
using StartLine.Domain.Coaching;
using StartLine.Domain.Plans;
using StartLine.Domain.Runners;
using StartLine.Domain.Sync;

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
        builder.HasMany<Activity>().WithOne().HasForeignKey(a => a.RunnerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany<ProviderConnection>().WithOne().HasForeignKey(c => c.RunnerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany<SyncJob>().WithOne().HasForeignKey(j => j.RunnerId).OnDelete(DeleteBehavior.Cascade);
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
        // One current plan per runner, whatever the application does.
        builder.HasIndex(p => p.RunnerId).IsUnique().HasFilter("[Status] = 'Active'").HasDatabaseName("IX_SavedPlans_OneActivePerRunner");

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
            inputs.Property(i => i.ReplanFrom).HasColumnName("ReplanFrom");
            inputs.Property(i => i.Setback).HasColumnName("Setback").HasConversion<string>().HasMaxLength(16);
            inputs.Property(i => i.RecentWeeklyKm).HasColumnName("RecentWeeklyKm");
            // Rows saved before the version stamp are version 1: they keep the shape they were built with.
            inputs.Property(i => i.GeneratorVersion).HasColumnName("GeneratorVersion").HasDefaultValue(TrainingPlanGenerator.OriginalVersion);
        });
    }
}

internal sealed class ActivityConfiguration : IEntityTypeConfiguration<Activity>
{
    // SQL `time` stops at 24 hours and multi-day ultras don't, so durations are stored as seconds.
    private static readonly ValueConverter<TimeSpan, double> Seconds = new(t => t.TotalSeconds, s => TimeSpan.FromSeconds(s));

    public void Configure(EntityTypeBuilder<Activity> builder)
    {
        builder.ToTable("Activities");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).ValueGeneratedNever();
        // One record per run: the same start time from the same runner is the same run, uploaded or synced.
        builder.HasIndex(a => new { a.RunnerId, a.StartedAt }).IsUnique();
        builder.Property(a => a.Kind).HasConversion<string>().HasMaxLength(16);
        builder.Property(a => a.Source).HasConversion<string>().HasMaxLength(16).HasDefaultValue(ActivitySource.Upload).HasSentinel(ActivitySource.Upload);
        builder.Property(a => a.ExternalId).HasMaxLength(ActivityOrigin.MaxExternalIdLength);
        builder.HasIndex(a => new { a.RunnerId, a.Source, a.ExternalId });
        // The sync worker looks for lapsed copies on every pass.
        builder.HasIndex(a => a.CachedUntil).HasFilter("[CachedUntil] IS NOT NULL");
        builder.Property(a => a.MovingTime).HasColumnName("MovingSeconds").HasConversion(Seconds);
        builder.Property(a => a.ElapsedTime).HasColumnName("ElapsedSeconds").HasConversion(Seconds);

        builder.ComplexProperty(a => a.Halves, halves =>
        {
            halves.Property(h => h.HalfMetres).HasColumnName("HalfMetres");
            halves.Property(h => h.FirstHalf).HasColumnName("FirstHalfSeconds").HasConversion(Seconds);
            halves.Property(h => h.SecondHalf).HasColumnName("SecondHalfSeconds").HasConversion(Seconds);
        });

        builder.ComplexProperty(a => a.PlannedSession, planned =>
        {
            planned.Property(p => p.PlanName).HasColumnName("PlannedPlanName").HasMaxLength(PlannedSessionMatch.MaxPlanNameLength);
            planned.Property(p => p.SessionType).HasColumnName("PlannedSessionType").HasConversion<string>().HasMaxLength(32);
            planned.Property(p => p.Title).HasColumnName("PlannedTitle").HasMaxLength(PlannedSessionMatch.MaxTitleLength);
            planned.Property(p => p.DistanceKm).HasColumnName("PlannedDistanceKm");
            planned.Property(p => p.FastestPaceSecondsPerKm).HasColumnName("PlannedFastestPace");
            planned.Property(p => p.SlowestPaceSecondsPerKm).HasColumnName("PlannedSlowestPace");
            planned.Property(p => p.Zone).HasColumnName("PlannedZone").HasConversion<string>().HasMaxLength(16);
            planned.Property(p => p.Shape).HasColumnName("PlannedShape").HasConversion<string>().HasMaxLength(16);
            planned.Property(p => p.WorkKm).HasColumnName("PlannedWorkKm");
            planned.Property(p => p.WorkZone).HasColumnName("PlannedWorkZone").HasConversion<string>().HasMaxLength(16);
            planned.Property(p => p.WorkFastestPaceSecondsPerKm).HasColumnName("PlannedWorkFastestPace");
            planned.Property(p => p.WorkSlowestPaceSecondsPerKm).HasColumnName("PlannedWorkSlowestPace");
            planned.Property(p => p.RepMetres).HasColumnName("PlannedRepMetres");
            planned.Property(p => p.EasyFastestPaceSecondsPerKm).HasColumnName("PlannedEasyFastestPace");
            planned.Property(p => p.EasySlowestPaceSecondsPerKm).HasColumnName("PlannedEasySlowestPace");
            planned.Property(p => p.GoalPaceSecondsPerKm).HasColumnName("PlannedGoalPace");
            planned.Property(p => p.NextTitle).HasColumnName("PlannedNextTitle").HasMaxLength(PlannedSessionMatch.MaxTitleLength);
            planned.Property(p => p.NextDate).HasColumnName("PlannedNextDate");
        });

        builder.ComplexProperty(a => a.Work, work =>
        {
            work.Property(w => w.StartMetres).HasColumnName("WorkStartMetres");
            work.Property(w => w.Metres).HasColumnName("WorkMetres");
            work.Property(w => w.Elapsed).HasColumnName("WorkSeconds").HasConversion(Seconds);
        });

        builder.Property(a => a.HeartRateTime).HasColumnName("HeartRateSeconds")
            .HasConversion(HeartRateTimeColumn.Converter, HeartRateTimeColumn.Comparer);

        builder.OwnsMany(a => a.Splits, split =>
        {
            split.ToTable("ActivitySplits");
            split.WithOwner().HasForeignKey("ActivityId");
            split.HasKey("ActivityId", nameof(Split.Number));
            split.Property(s => s.Number).ValueGeneratedNever();
            split.Property(s => s.MovingTime).HasColumnName("MovingSeconds").HasConversion(Seconds);
        });

        builder.OwnsMany(a => a.BestEfforts, effort =>
        {
            effort.ToTable("ActivityBestEfforts");
            effort.WithOwner().HasForeignKey("ActivityId");
            effort.HasKey("ActivityId", nameof(BestEffort.DistanceMetres));
            effort.Property(e => e.Elapsed).HasColumnName("ElapsedSeconds").HasConversion(Seconds);
        });
    }
}

/// <summary>Time at each heart rate as one compact column ("142:31.5;143:40"): read whole with its run, never queried.</summary>
internal static class HeartRateTimeColumn
{
    public static readonly ValueConverter<IReadOnlyList<HeartRateTime>, string> Converter = new(
        times => Format(times),
        text => Parse(text));

    public static readonly ValueComparer<IReadOnlyList<HeartRateTime>> Comparer = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        times => times.Aggregate(0, (hash, t) => HashCode.Combine(hash, t)),
        times => times.ToList());

    private static string Format(IReadOnlyList<HeartRateTime> times) =>
        string.Join(';', times.Select(t => string.Create(CultureInfo.InvariantCulture, $"{t.Bpm}:{t.Seconds}")));

    private static List<HeartRateTime> Parse(string text) =>
        [.. text.Split(';', StringSplitOptions.RemoveEmptyEntries).Select(pair =>
        {
            var parts = pair.Split(':');
            return new HeartRateTime(int.Parse(parts[0], CultureInfo.InvariantCulture), double.Parse(parts[1], CultureInfo.InvariantCulture));
        })];
}

internal sealed class ProviderConnectionConfiguration : IEntityTypeConfiguration<ProviderConnection>
{
    public void Configure(EntityTypeBuilder<ProviderConnection> builder)
    {
        builder.ToTable("ProviderConnections");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.Provider).HasConversion<string>().HasMaxLength(16);
        builder.Property(c => c.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(c => c.Scopes).HasMaxLength(ProviderConnection.MaxScopesLength).IsRequired();
        // Encrypted with Data Protection before they get here; never stored or logged in the clear.
        builder.Property(c => c.AccessToken).HasMaxLength(ProviderConnection.MaxTokenLength).IsRequired();
        builder.Property(c => c.RefreshToken).HasMaxLength(ProviderConnection.MaxTokenLength).IsRequired();
        builder.Property(c => c.Version).IsRowVersion();
        builder.HasIndex(c => new { c.RunnerId, c.Provider }).IsUnique();
        // One Taperday account per Strava account.
        builder.HasIndex(c => new { c.Provider, c.ExternalAthleteId }).IsUnique();
        builder.Ignore(c => c.IncludesPrivateRuns);
    }
}

internal sealed class SyncJobConfiguration : IEntityTypeConfiguration<SyncJob>
{
    public void Configure(EntityTypeBuilder<SyncJob> builder)
    {
        builder.ToTable("SyncJobs");
        builder.HasKey(j => j.Id);
        builder.Property(j => j.Id).ValueGeneratedNever();
        builder.Property(j => j.Provider).HasConversion<string>().HasMaxLength(16);
        builder.Property(j => j.Kind).HasConversion<string>().HasMaxLength(16);
        builder.Property(j => j.LastError).HasMaxLength(SyncJob.MaxErrorLength);
        builder.HasIndex(j => new { j.Failed, j.NotBefore, j.Priority });
        builder.HasIndex(j => new { j.RunnerId, j.Kind, j.ObjectId });
    }
}

internal sealed class SessionCheckInConfiguration : IEntityTypeConfiguration<SessionCheckIn>
{
    public void Configure(EntityTypeBuilder<SessionCheckIn> builder)
    {
        builder.ToTable("SessionCheckIns");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).ValueGeneratedNever();
        builder.Property(c => c.SessionType).HasConversion<string>().HasMaxLength(24);
        builder.Property(c => c.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(c => c.Pain).HasConversion<string>().HasMaxLength(16);
        builder.Property(c => c.PainArea).HasConversion<string>().HasMaxLength(16);
        // SQL `time` stops at 24 hours; an ultra doesn't, so durations are stored as seconds.
        builder.Property(c => c.Duration).HasConversion(t => t.HasValue ? (long?)t.Value.TotalSeconds : null, s => s.HasValue ? TimeSpan.FromSeconds(s.Value) : null);
        builder.Property(c => c.Note).HasMaxLength(SessionCheckIn.MaxNoteLength);

        // One check-in per session. Through the plan to the runner, so deleting either deletes these too.
        builder.HasIndex(c => new { c.SavedPlanId, c.Date, c.SessionType }).IsUnique();
        builder.HasOne<SavedPlan>().WithMany().HasForeignKey(c => c.SavedPlanId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class CoachWeekConfiguration : IEntityTypeConfiguration<CoachWeek>
{
    public void Configure(EntityTypeBuilder<CoachWeek> builder)
    {
        builder.ToTable("CoachWeeks");
        builder.HasKey(w => w.Id);
        builder.Property(w => w.Id).ValueGeneratedNever();
        builder.Property(w => w.Verdict).HasConversion<string>().HasMaxLength(16);
        builder.Property(w => w.Reasons).HasMaxLength(400).IsRequired();
        // Calls made before paces followed fitness had no nudge.
        builder.Property(w => w.PaceFactor).HasDefaultValue(1.0);

        // One call per week of a plan; the plan going takes its calls with it.
        builder.HasIndex(w => new { w.SavedPlanId, w.WeekStart }).IsUnique();
        builder.HasOne<SavedPlan>().WithMany().HasForeignKey(w => w.SavedPlanId).OnDelete(DeleteBehavior.Cascade);
    }
}
