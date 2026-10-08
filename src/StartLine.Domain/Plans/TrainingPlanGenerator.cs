using System.Globalization;
using StartLine.Domain.Common;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public static class TrainingPlanGenerator
{
    public const int MinRunsPerWeek = 3;
    public const int MaxRunsPerWeek = 7;
    public const int MinWeeks = 2;
    public const int MaxStrengthDays = 3;

    private const double MaxWeeklyIncrease = 1.10;
    private const double CutbackFactor = 0.8;
    private const double MinRunKm = 3;
    private const double MinLongRunKm = 5;
    private const double MaxEasyRunKm = 16;

    public static TrainingPlan Generate(PlanParameters parameters)
    {
        ArgumentNullException.ThrowIfNull(parameters);
        Validate(parameters);

        var profile = PlanProfile.For(parameters.RaceDistance);
        var paces = TrainingPaces.FromGoal(parameters.RaceDistance, parameters.GoalTime);
        var workouts = new WorkoutBuilder(profile.Category, paces, parameters.RaceDistance);
        var layout = WeekLayout.For(parameters.RunDays, parameters.LongRunDay);
        var warnings = new List<PlanWarning>();

        var raceWeekStart = MondayOf(parameters.RaceDate);
        var startDate = FirstMondayOnOrAfter(parameters.Today);
        var weekCount = (raceWeekStart.DayNumber - startDate.DayNumber) / 7 + 1;

        if (weekCount < MinWeeks)
        {
            throw new DomainException($"The race must be at least {MinWeeks} weeks after the plan starts.");
        }

        if (weekCount > profile.MaxWeeks)
        {
            weekCount = profile.MaxWeeks;
            startDate = raceWeekStart.AddDays(-7 * (weekCount - 1));
            warnings.Add(new("starts-later",
                $"Your plan starts on {startDate.ToString("dddd d MMMM yyyy", CultureInfo.InvariantCulture)}. " +
                $"More than {profile.MaxWeeks} weeks of structured training rarely helps; keep running easily until then."));
        }
        else if (weekCount < profile.MinWeeks)
        {
            warnings.Add(new("short-plan",
                $"{weekCount} weeks is less than the {profile.MinWeeks} we recommend for this distance. " +
                "The plan does what it can, but consider a more forgiving goal time."));
        }

        if (layout.HasAdjacentHardDays)
        {
            warnings.Add(new("back-to-back",
                "Your run days are bunched together, so your hard session sits right next to your long run. " +
                "Spreading your days out would give your legs more time to recover."));
        }

        var taperWeeks = Math.Min(profile.TaperWeeks, weekCount - 1);
        var trainingWeeks = weekCount - taperWeeks;
        var phases = AllocatePhases(trainingWeeks, parameters.Experience);
        var volumes = PlanVolumes(parameters, profile, phases, warnings);

        var weeks = new List<PlanWeek>(weekCount);
        for (var i = 0; i < trainingWeeks; i++)
        {
            var (phase, indexInPhase, phaseLength) = phases[i];
            var week = new WeekContext(
                startDate.AddDays(7 * i),
                volumes[i],
                phase,
                indexInPhase,
                phaseLength <= 1 ? 1 : indexInPhase / (double)(phaseLength - 1),
                IsCutback(i, trainingWeeks),
                IsFirstWeek: i == 0);
            weeks.Add(new PlanWeek(i + 1, week.Start, phase, week.IsCutback, TrainingWeek(parameters, profile, workouts, layout, week)));
        }

        var peakKm = volumes.Max();
        double[] taperFactors = (taperWeeks - 1) switch
        {
            >= 2 => [0.75, 0.6],
            1 => [0.7],
            _ => [],
        };
        for (var t = 0; t < taperFactors.Length; t++)
        {
            var week = new WeekContext(startDate.AddDays(7 * (trainingWeeks + t)), peakKm * taperFactors[t],
                TrainingPhase.Taper, t, 0, IsCutback: false, IsFirstWeek: false);
            weeks.Add(new PlanWeek(trainingWeeks + t + 1, week.Start, TrainingPhase.Taper, false,
                TrainingWeek(parameters, profile, workouts, layout, week)));
        }

        weeks.Add(new PlanWeek(weekCount, raceWeekStart, TrainingPhase.RaceWeek, false,
            RaceWeek(parameters, profile, workouts, layout, raceWeekStart, peakKm * profile.RaceWeekFactor)));

        return new TrainingPlan(parameters.RaceDistance, profile.Category, parameters.RaceDate, parameters.GoalTime,
            startDate, paces, weeks, warnings);
    }

    private sealed record WeekContext(
        DateOnly Start,
        double TargetKm,
        TrainingPhase Phase,
        int IndexInPhase,
        double Progress,
        bool IsCutback,
        bool IsFirstWeek);

    private static void Validate(PlanParameters p)
    {
        if (p.GoalTime <= TimeSpan.Zero)
        {
            throw new DomainException("The goal time must be positive.");
        }

        if (p.RunsPerWeek is < MinRunsPerWeek or > MaxRunsPerWeek)
        {
            throw new DomainException($"Choose between {MinRunsPerWeek} and {MaxRunsPerWeek} different run days.");
        }

        if (!p.RunDays.Contains(p.LongRunDay))
        {
            throw new DomainException("The long run day must be one of your run days.");
        }

        if (p.StrengthDays?.Distinct().Count() > MaxStrengthDays)
        {
            throw new DomainException($"Choose at most {MaxStrengthDays} strength days.");
        }

        if (!Enum.IsDefined(p.Experience))
        {
            throw new DomainException("Unknown experience level.");
        }

        if (p.CurrentWeeklyKm is < 0 or > 300)
        {
            throw new DomainException("Current weekly distance must be between 0 and 300 km.");
        }

        if (p.RaceDate <= p.Today)
        {
            throw new DomainException("The race date must be in the future.");
        }
    }

    private static (TrainingPhase Phase, int IndexInPhase, int PhaseLength)[] AllocatePhases(int trainingWeeks, Experience experience)
    {
        // Newer runners spend longer building an aerobic base before the harder phases.
        var baseShare = experience == Experience.New ? 0.5 : 0.4;
        var peak = trainingWeeks >= 3 ? Math.Max(1, (int)Math.Round(trainingWeeks * 0.25)) : 0;
        var @base = trainingWeeks >= 4 ? Math.Max(1, (int)Math.Round(trainingWeeks * baseShare)) : 0;
        var build = trainingWeeks - peak - @base;

        return
        [
            .. Enumerable.Range(0, @base).Select(i => (TrainingPhase.Base, i, @base)),
            .. Enumerable.Range(0, build).Select(i => (TrainingPhase.Build, i, build)),
            .. Enumerable.Range(0, peak).Select(i => (TrainingPhase.Peak, i, peak)),
        ];
    }

    // Every fourth week eases off, except the last week before the taper.
    private static bool IsCutback(int weekIndex, int trainingWeeks) =>
        (weekIndex + 1) % 4 == 0 && weekIndex != trainingWeeks - 1;

    private static double[] PlanVolumes(
        PlanParameters p,
        PlanProfile profile,
        (TrainingPhase, int, int)[] phases,
        List<PlanWarning> warnings)
    {
        var experienceFactor = p.Experience switch
        {
            Experience.New => 0.8,
            Experience.Experienced => 1.15,
            _ => 1.0,
        };
        var usualPeak = profile.PeakKmAtFiveRuns * PlanProfile.RunsFactor(p.RunsPerWeek) * experienceFactor;
        var startKm = p.CurrentWeeklyKm is > 0 ? p.CurrentWeeklyKm.Value : usualPeak * (p.Experience == Experience.New ? 0.45 : 0.6);
        startKm = Math.Max(startKm, p.RunsPerWeek * MinRunKm);

        var progressionWeeks = Enumerable.Range(0, phases.Length).Count(i => !IsCutback(i, phases.Length));
        var reachable = startKm * Math.Pow(MaxWeeklyIncrease, Math.Max(0, progressionWeeks - 1));
        var peakKm = Math.Max(startKm, Math.Min(usualPeak, reachable));

        if (reachable < usualPeak * 0.75)
        {
            warnings.Add(new("low-volume",
                "Building safely from your current weekly distance won't reach the volume this race usually needs " +
                "in the time available. More weeks or a more conservative goal would help."));
        }

        var volumes = new double[phases.Length];
        var step = 0;
        var lastProgression = startKm;
        for (var i = 0; i < phases.Length; i++)
        {
            if (IsCutback(i, phases.Length))
            {
                volumes[i] = lastProgression * CutbackFactor;
                continue;
            }

            lastProgression = progressionWeeks <= 1
                ? peakKm
                : startKm * Math.Pow(peakKm / startKm, step / (double)(progressionWeeks - 1));
            volumes[i] = lastProgression;
            step++;
        }

        return volumes;
    }

    private static List<PlannedSession> TrainingWeek(
        PlanParameters p, PlanProfile profile, WorkoutBuilder workouts, WeekLayout layout, WeekContext week)
    {
        var (first, second) = Rotation(week.Phase, profile.Category, week.IndexInPhase);
        var singleQuality = !layout.Days.Any(d => d.Role == DayRole.SecondQuality);
        if (singleQuality && second is { } alternate && week.IndexInPhase % 2 == 1)
        {
            // One hard day a week: alternate between the two sessions instead of dropping one for good.
            first = alternate;
        }

        var longKm = LongRunKm(p, profile, workouts, week.TargetKm);
        var sessions = new List<PlannedSession>(layout.Days.Count);
        var easyDays = new List<(DateOnly Date, SessionType Type)>();

        // Ultra back-to-back weekends: the run before the long run becomes a medium-long run.
        var longDay = layout.Days.Single(d => d.Role == DayRole.Long).DayIndex;
        var backToBackDay = IsUltra(profile.Category) && !week.IsCutback && week.Phase is TrainingPhase.Build or TrainingPhase.Peak
            ? layout.Days.Where(d => d.DayIndex == (longDay + 6) % 7 && d.Role is DayRole.Easy or DayRole.Strides)
                .Select(d => (int?)d.DayIndex).FirstOrDefault()
            : null;

        foreach (var (dayIndex, role) in layout.Days)
        {
            var date = week.Start.AddDays(dayIndex);
            if (dayIndex == backToBackDay)
            {
                sessions.Add(WorkoutBuilder.MediumLong(date, WorkoutBuilder.Round(Math.Max(8, longKm * 0.55))));
                continue;
            }

            switch (role)
            {
                case DayRole.Long:
                    var longType = LongRunType(week.Phase, profile.Category, p.RunsPerWeek, week.IndexInPhase, week.IsCutback);
                    sessions.Add(workouts.Long(date, longType, longKm));
                    break;
                case DayRole.Quality when !week.IsCutback:
                    sessions.Add(workouts.Quality(date, first, week.Phase, week.Progress));
                    break;
                case DayRole.SecondQuality when !week.IsCutback && second is { } secondType:
                    sessions.Add(workouts.Quality(date, secondType, week.Phase, week.Progress));
                    break;
                case DayRole.Recovery:
                    // A Monday recovery follows the previous week's hard day, which week one doesn't have.
                    easyDays.Add((date, week.IsFirstWeek && dayIndex == 0 ? SessionType.Easy : SessionType.Recovery));
                    break;
                case DayRole.Easy:
                    easyDays.Add((date, SessionType.Easy));
                    break;
                default:
                    // Strides days, and quality days in a cutback week (or with no second session this phase).
                    easyDays.Add((date, role == DayRole.SecondQuality && week.IsCutback ? SessionType.Easy : SessionType.EasyWithStrides));
                    break;
            }
        }

        // Whatever distance is left over is shared between the easy days.
        var remaining = week.TargetKm - sessions.Sum(s => s.DistanceKm);
        var easyKm = easyDays.Count == 0
            ? 0
            : WorkoutBuilder.Round(Math.Clamp(remaining / easyDays.Count, MinRunKm,
                Math.Max(MinRunKm, Math.Min(MaxEasyRunKm, longKm * 0.75))));
        sessions.AddRange(easyDays.Select(d => WorkoutBuilder.Easy(d.Date, d.Type, easyKm)));

        // Strength goes on any chosen day except the long run's: that day is long enough already.
        foreach (var day in (p.StrengthDays ?? []).Select(WeekLayout.MondayIndex).Distinct().Where(d => d != longDay))
        {
            sessions.Add(WorkoutBuilder.Strength(week.Start.AddDays(day), week.Phase, week.IsCutback));
        }

        return [.. sessions.OrderBy(s => s.Date).ThenBy(s => s.Type == SessionType.Strength)];
    }

    /// <summary>
    /// The week's hard sessions. They rotate so the same day isn't the same workout every week:
    /// strength and speed play early, sharper speed and threshold work in Build, race-specific work in Peak.
    /// </summary>
    private static (SessionType First, SessionType? Second) Rotation(
        TrainingPhase phase, DistanceCategory category, int indexInPhase)
    {
        var even = indexInPhase % 2 == 0;
        SessionType Pick(SessionType onEven, SessionType onOdd) => even ? onEven : onOdd;

        // The shorter the race, the more of the hard work is fast; the longer, the more is threshold and race pace.
        // Ultras keep one hard day midweek because the back-to-back weekend is the real work.
        return (phase, category) switch
        {
            (TrainingPhase.Base, _) => (Pick(SessionType.Hills, SessionType.Fartlek), even ? null : SessionType.ProgressionRun),

            (TrainingPhase.Build, DistanceCategory.FiveK) => (SessionType.Intervals, Pick(SessionType.Fartlek, SessionType.Tempo)),
            (TrainingPhase.Build, DistanceCategory.TenK) => (Pick(SessionType.Intervals, SessionType.Fartlek), Pick(SessionType.Tempo, SessionType.ProgressionRun)),
            (TrainingPhase.Build, DistanceCategory.HalfMarathon) => (Pick(SessionType.Intervals, SessionType.Fartlek), Pick(SessionType.Tempo, SessionType.CruiseIntervals)),
            (TrainingPhase.Build, DistanceCategory.Marathon) => (Pick(SessionType.CruiseIntervals, SessionType.Intervals), Pick(SessionType.ProgressionRun, SessionType.Tempo)),
            (TrainingPhase.Build, _) => (Pick(SessionType.Hills, SessionType.Tempo), Pick(SessionType.ProgressionRun, SessionType.Fartlek)),

            (TrainingPhase.Peak, DistanceCategory.FiveK or DistanceCategory.TenK) => (SessionType.Intervals, SessionType.RacePace),
            (TrainingPhase.Peak, DistanceCategory.HalfMarathon) => (Pick(SessionType.Tempo, SessionType.CruiseIntervals), SessionType.RacePace),
            (TrainingPhase.Peak, DistanceCategory.Marathon) => (Pick(SessionType.CruiseIntervals, SessionType.Tempo), SessionType.RacePace),
            (TrainingPhase.Peak, _) => (Pick(SessionType.RacePace, SessionType.Hills), null),

            _ => (SessionType.RacePace, null),
        };
    }

    private static bool IsUltra(DistanceCategory category) =>
        category is DistanceCategory.Ultra or DistanceCategory.LongUltra;

    private static SessionType LongRunType(
        TrainingPhase phase, DistanceCategory category, int runsPerWeek, int indexInPhase, bool isCutback)
    {
        if (isCutback)
        {
            return SessionType.LongRun;
        }

        // On four runs or fewer, two midweek quality sessions are already plenty, so the long run
        // stays easy through Build and only carries race-pace work every other Peak week.
        var lowFrequency = runsPerWeek <= 4;
        var shortRace = category is DistanceCategory.FiveK or DistanceCategory.TenK;
        var peakSession = shortRace ? SessionType.LongRunFastFinish : SessionType.LongRunRacePace;
        return phase switch
        {
            TrainingPhase.Build when !lowFrequency && indexInPhase % 2 == 1 => SessionType.LongRunFastFinish,
            TrainingPhase.Peak when !lowFrequency || indexInPhase % 2 == 0 => peakSession,
            _ => SessionType.LongRun,
        };
    }

    private static double LongRunKm(PlanParameters p, PlanProfile profile, WorkoutBuilder workouts, double weeklyKm)
    {
        var share = p.RunsPerWeek switch
        {
            3 => 0.40,
            4 => 0.35,
            _ => 0.30,
        };
        if (IsUltra(profile.Category))
        {
            share += 0.05;
        }

        // Slower runners hit the time cap before the distance cap, so a long run never becomes an all-day effort.
        var cap = Math.Min(profile.LongRunCapKm, workouts.KmIn(PaceZone.LongRun, profile.LongRunCapTime));
        return WorkoutBuilder.Round(Math.Clamp(weeklyKm * share, MinLongRunKm, Math.Max(MinLongRunKm, cap)));
    }

    // Short and light, with one brief touch of race pace early on and a shakeout close to the start.
    private static List<PlannedSession> RaceWeek(
        PlanParameters p, PlanProfile profile, WorkoutBuilder workouts, WeekLayout layout, DateOnly weekStart, double budgetKm)
    {
        var runDays = layout.Days
            .Select(d => (Date: weekStart.AddDays(d.DayIndex), d.Role))
            .Where(d => d.Date < p.RaceDate)
            .ToList();

        var sessions = new List<PlannedSession>(runDays.Count + 1);
        if (runDays.Count > 0)
        {
            var maxRunKm = profile.Category is DistanceCategory.Marathon or DistanceCategory.Ultra ? 8 : 6;
            var easyKm = WorkoutBuilder.Round(Math.Clamp(budgetKm / runDays.Count, MinRunKm, maxRunKm));
            var lastDay = runDays[^1].Date;
            var sharpenerDay = runDays
                .Where(d => d.Role is DayRole.Quality or DayRole.SecondQuality && d.Date <= p.RaceDate.AddDays(-3))
                .Select(d => (DateOnly?)d.Date)
                .FirstOrDefault();

            foreach (var (date, role) in runDays)
            {
                sessions.Add(date switch
                {
                    _ when date == lastDay && date >= p.RaceDate.AddDays(-2) => WorkoutBuilder.Shakeout(date, easyKm),
                    _ when date == sharpenerDay => workouts.Sharpener(date),
                    _ => WorkoutBuilder.Easy(date, role == DayRole.Recovery ? SessionType.Recovery : SessionType.Easy, easyKm),
                });
            }
        }

        sessions.Add(workouts.RaceDay(p.RaceDate));
        return sessions;
    }

    private static DateOnly MondayOf(DateOnly date) => date.AddDays(-WeekLayout.MondayIndex(date.DayOfWeek));

    private static DateOnly FirstMondayOnOrAfter(DateOnly date) =>
        date.DayOfWeek == DayOfWeek.Monday ? date : MondayOf(date).AddDays(7);
}
