using System.Globalization;
using StartLine.Domain.Common;
using StartLine.Domain.Running;

namespace StartLine.Domain.Plans;

public static partial class TrainingPlanGenerator
{
    public const int MinRunsPerWeek = 3;
    public const int MaxRunsPerWeek = 7;
    public const int MinWeeks = 2;
    public const int MaxStrengthDays = 3;
    public const int MaxYearsAhead = 2;

    private const double MaxWeeklyIncrease = 1.10;
    private const double CutbackFactor = 0.8;
    private const double MinRunKm = 3;
    private const double MinLongRunKm = 5;
    private const double MaxEasyRunKm = 16;

    // Below this share of the volume a race usually needs, the plan warns that the build is thin.
    private const double LowVolumeShare = 0.75;

    public static TrainingPlan Generate(PlanParameters parameters)
    {
        ArgumentNullException.ThrowIfNull(parameters);
        Validate(parameters);

        var profile = PlanProfile.For(parameters.RaceDistance);
        var shape = PlanShape.For(parameters, profile);
        var paces = TrainingPaces.FromGoal(parameters.RaceDistance, parameters.GoalTime);
        var workouts = new WorkoutBuilder(profile.Category, paces, parameters.RaceDistance);
        var layout = WeekLayout.For(parameters.RunDays, parameters.LongRunDay);

        // A replan rebuilds on top of the plan as first built, so that plan is always generated first. Both use the
        // plan's own version, so a replan never changes the plan's shape.
        var workoutsFor = WorkoutsByWeek(parameters, profile, workouts);
        var original = Fresh(parameters, profile, shape, paces, workoutsFor, layout);
        var plan = parameters.Replan is { } replan
            ? Replanned(parameters, replan, original, profile, shape, workoutsFor, layout)
            : original;
        return WithFitness(parameters, profile, plan);
    }

    private static TrainingPlan Fresh(
        PlanParameters parameters,
        PlanProfile profile,
        PlanShape shape,
        IReadOnlyDictionary<PaceZone, PaceRange> paces,
        Func<DateOnly, WorkoutBuilder> workoutsFor,
        WeekLayout layout)
    {
        var warnings = new List<PlanWarning>();

        var raceWeekStart = MondayOf(parameters.RaceDate);
        // The runner's own start day if they chose one, otherwise the next Monday. Weeks always run Monday to Sunday, so a
        // start mid-week makes a shorter first week (trimmed below).
        var startDate = parameters.StartOn is { } startOn ? MondayOf(startOn) : FirstMondayOnOrAfter(parameters.Today);
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
        var volumes = PlanVolumes(parameters, profile, shape, phases, warnings);
        var longRuns = LongRunTrack(parameters, profile, workoutsFor(startDate), shape, volumes, i => IsCutback(i, trainingWeeks, shape));

        var weeks = new List<PlanWeek>(weekCount);
        // Version 2 holds every training week to the 10% limit on its real distance, the first against where the runner
        // is now. A version 1 plan is only fitted from the coach's first call on, and not at all before it.
        var lastFullWeekKm = shape.LimitsRealGrowth && trainingWeeks > 0 ? volumes[0] : double.MaxValue;
        PlanWeek Built(int number, WeekContext week, bool limitsRealGrowth = false)
        {
            List<PlannedSession> sessions;
            if (limitsRealGrowth)
            {
                // A target the runs can't add up to (the long and easy runs have caps) starts at the limit, not above it.
                // The easy runs shorten first; if that isn't enough the second hard session gives way (never the first: one
                // a week is the least a build should have), and last of all the long run steps back. A week a little over
                // its target but within 10% keeps everything. The coach's calls still apply on top.
                var call = CallFor(parameters, week.Start);
                var hold = call?.HoldVolume == true;
                week = Coached(week, call, lastFullWeekKm);
                week = week with { TargetKm = Math.Min(week.TargetKm, lastFullWeekKm * (hold ? 1 : MaxWeeklyIncrease)) };
                var fitted = week with { FitToVolume = true, KeepsFirstHardSession = true };
                (_, sessions) = FirstFittedWeek(parameters, profile, workoutsFor(week.Start), layout, lastFullWeekKm, hold,
                    week with { KeepsFirstHardSession = true }, fitted, fitted with { LongRunFitsWeek = true });
            }
            else if (IsCoachedFrom(parameters, week.Start))
            {
                var call = CallFor(parameters, week.Start);
                week = Coached(week, call, lastFullWeekKm);
                sessions = FittedWeek(parameters, profile, workoutsFor(week.Start), layout, ref week, lastFullWeekKm, call?.HoldVolume == true);
            }
            else
            {
                sessions = TrainingWeek(parameters, profile, workoutsFor(week.Start), layout, week);
            }

            if (!week.IsCutback)
            {
                lastFullWeekKm = Kilometres(sessions);
            }

            return new PlanWeek(number, week.Start, week.Phase, week.IsCutback, sessions);
        }

        for (var i = 0; i < trainingWeeks; i++)
        {
            var (phase, indexInPhase, phaseLength) = phases[i];
            weeks.Add(Built(i + 1, new WeekContext(
                startDate.AddDays(7 * i),
                volumes[i],
                phase,
                indexInPhase,
                phaseLength <= 1 ? 1 : indexInPhase / (double)(phaseLength - 1),
                IsCutback(i, trainingWeeks, shape),
                IsFirstWeek: i == 0,
                LongRunKm: longRuns?[i]),
                shape.LimitsRealGrowth));
        }

        var peakKm = volumes.Max();
        var taperFactors = TaperFactors(taperWeeks - 1);
        for (var t = 0; t < taperFactors.Length; t++)
        {
            weeks.Add(Built(trainingWeeks + t + 1, new WeekContext(startDate.AddDays(7 * (trainingWeeks + t)), peakKm * taperFactors[t],
                TrainingPhase.Taper, t, 0, IsCutback: false, IsFirstWeek: false)));
        }

        weeks.Add(new PlanWeek(weekCount, raceWeekStart, TrainingPhase.RaceWeek, false,
            RaceWeek(parameters, profile, workoutsFor(raceWeekStart), layout, raceWeekStart, peakKm * profile.RaceWeekFactor)));

        // A start mid-week: the first week keeps only the runs from that day on, and the plan starts that day. (A start
        // moved later by the cap on plan length starts on its Monday instead.)
        var firstDay = startDate;
        if (parameters.StartOn is { } chosen && chosen > startDate)
        {
            weeks[0] = weeks[0] with { Sessions = [.. weeks[0].Sessions.Where(s => s.Date >= chosen)] };
            firstDay = chosen;
        }

        return new TrainingPlan(parameters.RaceDistance, profile.Category, parameters.RaceDate, parameters.GoalTime,
            firstDay, paces, weeks, warnings);
    }

    // The taper weeks before race week, as shares of the peak.
    private static double[] TaperFactors(int taperWeeksBeforeRaceWeek) => taperWeeksBeforeRaceWeek switch
    {
        >= 2 => [0.75, 0.6],
        1 => [0.7],
        _ => [],
    };

    /// <param name="EasyOnly">A return week after illness or injury: no hard sessions and a plain long run.</param>
    /// <param name="FitToVolume">A rebuilt or coached week: it keeps only the hard sessions its volume has room for.</param>
    /// <param name="DoseStep">The coach's call on the hard sessions: -1 one smaller hard session, +1 a bigger one.</param>
    /// <param name="LongRunKm">The long run's own track (generator v2). Null: the long run is a share of the week.</param>
    /// <param name="KeepsFirstHardSession">Fitting to volume gives up the second hard session, never the first.</param>
    /// <param name="LongRunFitsWeek">The long run's track gives way to the week: at most half its target.</param>
    private sealed record WeekContext(
        DateOnly Start,
        double TargetKm,
        TrainingPhase Phase,
        int IndexInPhase,
        double Progress,
        bool IsCutback,
        bool IsFirstWeek,
        bool EasyOnly = false,
        bool FitToVolume = false,
        int DoseStep = 0,
        double? LongRunKm = null,
        bool KeepsFirstHardSession = false,
        bool LongRunFitsWeek = false)
    {
        /// <summary>Lighter than usual: a cutback or a return week. Either way, no hard sessions.</summary>
        public bool IsEasier => IsCutback || EasyOnly;
    }

    private static void Validate(PlanParameters p)
    {
        if (p.GoalTime <= TimeSpan.Zero)
        {
            throw new DomainException("The goal time must be positive.");
        }

        if (p.RunDays.Any(d => !Enum.IsDefined(d)) || !Enum.IsDefined(p.LongRunDay)
            || (p.StrengthDays ?? []).Any(d => !Enum.IsDefined(d)))
        {
            throw new DomainException("Run, long-run and strength days must be days of the week.");
        }

        if (p.RaceDate > p.Today.AddYears(MaxYearsAhead))
        {
            throw new DomainException($"The race must be within {MaxYearsAhead} years.");
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

        if (p.StartOn is { } startOn && (startOn < p.Today || startOn > p.RaceDate.AddDays(-7 * MinWeeks)))
        {
            throw new DomainException($"Start your plan between today and {MinWeeks} weeks before your race.");
        }

        if (p.GeneratorVersion is < OriginalVersion or > LatestVersion)
        {
            throw new DomainException("Unknown plan version.");
        }

        if (p.Replan is { } replan)
        {
            ValidateReplan(p, replan);
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

    // Every fourth week eases off (every third for a new runner in v2), except the last week before the taper.
    private static bool IsCutback(int weekIndex, int trainingWeeks, PlanShape shape) =>
        (weekIndex + 1) % shape.CutbackEvery == 0 && weekIndex != trainingWeeks - 1;

    private static double[] PlanVolumes(
        PlanParameters p,
        PlanProfile profile,
        PlanShape shape,
        (TrainingPhase, int, int)[] phases,
        List<PlanWarning> warnings)
    {
        var usualPeak = UsualPeakKm(p, profile);
        var startKm = p.CurrentWeeklyKm is > 0 ? p.CurrentWeeklyKm.Value : usualPeak * (p.Experience == Experience.New ? 0.45 : 0.6);
        startKm = Math.Max(startKm, p.RunsPerWeek * MinRunKm);

        var reachable = ReachableKm(startKm, phases.Length, shape);
        if (reachable < usualPeak * LowVolumeShare)
        {
            warnings.Add(new("low-volume",
                "Building safely from your current weekly distance won't reach the volume this race usually needs " +
                "in the time available. More weeks or a more conservative goal would help."));
        }

        return Ramp(startKm, Math.Max(startKm, Math.Min(usualPeak, reachable)), phases.Length, shape);
    }

    /// <summary>The peak week this race usually needs, for this many runs a week and this much experience.</summary>
    private static double UsualPeakKm(PlanParameters p, PlanProfile profile)
    {
        var experienceFactor = p.Experience switch
        {
            Experience.New => 0.8,
            Experience.Experienced => 1.15,
            _ => 1.0,
        };
        return profile.PeakKmAtFiveRuns * PlanProfile.RunsFactor(p.RunsPerWeek) * experienceFactor;
    }

    private static int ProgressionWeeks(int weeks, PlanShape shape) => Enumerable.Range(0, weeks).Count(i => !IsCutback(i, weeks, shape));

    /// <summary>The most a build of this many weeks can reach from <paramref name="startKm"/> without growing over 10% a week.</summary>
    private static double ReachableKm(double startKm, int weeks, PlanShape shape) => shape.FrontLoaded
        ? FrontLoadedReachableKm(startKm, weeks, shape)
        : startKm * Math.Pow(MaxWeeklyIncrease, Math.Max(0, ProgressionWeeks(weeks, shape) - 1));

    /// <summary>
    /// Weekly volumes from <paramref name="startKm"/> to <paramref name="peakKm"/>: growing evenly between cutbacks
    /// (version 1), or front-loaded (see <see cref="FrontLoadedRamp"/>). The peak must be reachable (see
    /// <see cref="ReachableKm"/>), which keeps every step within 10%.
    /// </summary>
    private static double[] Ramp(double startKm, double peakKm, int weeks, PlanShape shape)
    {
        if (shape.FrontLoaded)
        {
            return FrontLoadedRamp(startKm, peakKm, weeks, shape);
        }

        var progressionWeeks = ProgressionWeeks(weeks, shape);
        var volumes = new double[weeks];
        var step = 0;
        var lastProgression = startKm;
        for (var i = 0; i < weeks; i++)
        {
            if (IsCutback(i, weeks, shape))
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

        // The track was built from the goal's paces; the coach can move them later, so the caps are met at this week's own.
        var longKm = week.LongRunKm switch
        {
            null => LongRunKm(p, profile, workouts, week.TargetKm),
            { } track when week.LongRunFitsWeek => WorkoutBuilder.Round(Math.Max(MinLongRunKm, Math.Min(Math.Min(track, LongRunCapKm(profile, workouts)), week.TargetKm * LongRunMaxShareOfWeek))),
            { } track => WorkoutBuilder.Round(Math.Min(track, LongRunCapKm(profile, workouts))),
        };
        var progress = Math.Clamp(week.Progress + week.DoseStep * DoseStepProgress, 0, 1);
        var sessions = new List<PlannedSession>(layout.Days.Count);
        var easyDays = new List<(DateOnly Date, SessionType Type)>();
        var hardSessions = new List<(PlannedSession Session, bool IsSecond)>(2);

        // Ultra back-to-back weekends: the run before the long run becomes a medium-long run.
        var longDay = layout.Days.Single(d => d.Role == DayRole.Long).DayIndex;
        var backToBackDay = IsUltra(profile.Category) && !week.IsEasier && week.Phase is TrainingPhase.Build or TrainingPhase.Peak
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
                    var longType = LongRunType(week.Phase, profile.Category, p.RunsPerWeek, week.IndexInPhase, week.IsEasier);
                    sessions.Add(workouts.Long(date, longType, longKm));
                    break;
                case DayRole.Quality when !week.IsEasier:
                    hardSessions.Add((workouts.Quality(date, first, week.Phase, progress), false));
                    sessions.Add(hardSessions[^1].Session);
                    break;
                case DayRole.SecondQuality when !week.IsEasier && week.DoseStep >= 0 && second is { } secondType:
                    hardSessions.Add((workouts.Quality(date, secondType, week.Phase, progress), true));
                    sessions.Add(hardSessions[^1].Session);
                    break;
                case DayRole.Recovery:
                    // A Monday recovery follows the previous week's hard day, which week one doesn't have.
                    easyDays.Add((date, week.IsFirstWeek && dayIndex == 0 ? SessionType.Easy : SessionType.Recovery));
                    break;
                case DayRole.Easy:
                    easyDays.Add((date, SessionType.Easy));
                    break;
                default:
                    // Strides days, and quality days in a cutback week (or with no second session this phase). A return
                    // week after illness or injury is easy running only, strides included.
                    easyDays.Add((date, week.EasyOnly || (role == DayRole.SecondQuality && week.IsCutback) ? SessionType.Easy : SessionType.EasyWithStrides));
                    break;
            }
        }

        // Hard sessions have a set length, so in a low-volume week they can push it past its target. A rebuilt week
        // can't afford that: the second hard session (then the first) becomes easy running until the easy days fit. A
        // version 2 week that isn't a rebuild keeps its first: one hard session a week is the least a build should have.
        if (week.FitToVolume)
        {
            foreach (var (hard, _) in hardSessions.Where(h => h.IsSecond || !week.KeepsFirstHardSession).OrderByDescending(h => h.IsSecond))
            {
                if (week.TargetKm - sessions.Sum(s => s.DistanceKm) >= easyDays.Count * MinRunKm)
                {
                    break;
                }

                sessions.Remove(hard);
                easyDays.Add((hard.Date, SessionType.EasyWithStrides));
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
            sessions.Add(WorkoutBuilder.Strength(week.Start.AddDays(day), week.Phase, week.IsEasier));
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

        return WorkoutBuilder.Round(Math.Clamp(weeklyKm * share, MinLongRunKm, LongRunCapKm(profile, workouts)));
    }

    /// <summary>
    /// The longest a long run may be. Slower runners hit the time cap before the distance cap, so a long run never becomes
    /// an all-day effort.
    /// </summary>
    private static double LongRunCapKm(PlanProfile profile, WorkoutBuilder workouts) =>
        Math.Max(MinLongRunKm, Math.Min(profile.LongRunCapKm, workouts.KmIn(PaceZone.LongRun, profile.LongRunCapTime)));

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
            var maxRunKm = profile.Category == DistanceCategory.Marathon || IsUltra(profile.Category) ? 8 : 6;
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
