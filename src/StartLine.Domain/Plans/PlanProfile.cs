using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

/// <summary>How a plan is shaped for a race distance. Peak volume assumes five runs a week.</summary>
internal sealed record PlanProfile(
    DistanceCategory Category,
    int MinWeeks,
    int MaxWeeks,
    int TaperWeeks,
    double PeakKmAtFiveRuns,
    double LongRunCapKm,
    TimeSpan LongRunCapTime,
    double RaceWeekFactor)
{
    public static DistanceCategory Categorise(Distance distance) => distance.Kilometres switch
    {
        <= 7.5 => DistanceCategory.FiveK,
        <= 15 => DistanceCategory.TenK,
        <= 30 => DistanceCategory.HalfMarathon,
        <= 45 => DistanceCategory.Marathon,
        <= 60 => DistanceCategory.Ultra,
        _ => DistanceCategory.LongUltra,
    };

    public static PlanProfile For(Distance distance) => Categorise(distance) switch
    {
        DistanceCategory.FiveK => new(DistanceCategory.FiveK, 4, 12, 1, 35, 12, TimeSpan.FromMinutes(90), 0.5),
        DistanceCategory.TenK => new(DistanceCategory.TenK, 6, 14, 1, 45, 16, TimeSpan.FromMinutes(105), 0.5),
        DistanceCategory.HalfMarathon => new(DistanceCategory.HalfMarathon, 8, 16, 2, 55, 21, TimeSpan.FromMinutes(150), 0.4),
        DistanceCategory.Marathon => new(DistanceCategory.Marathon, 10, 20, 3, 70, 32, TimeSpan.FromMinutes(195), 0.35),
        DistanceCategory.Ultra => new(DistanceCategory.Ultra, 12, 20, 3, 85, Math.Min(42, distance.Kilometres / 2 + 10), TimeSpan.FromMinutes(270), 0.3),
        _ => new(DistanceCategory.LongUltra, 14, 24, 3, 100, 45, TimeSpan.FromMinutes(300), 0.3),
    };

    public static double RunsFactor(int runsPerWeek) => runsPerWeek switch
    {
        3 => 0.65,
        4 => 0.82,
        5 => 1.0,
        6 => 1.12,
        _ => 1.2,
    };
}
