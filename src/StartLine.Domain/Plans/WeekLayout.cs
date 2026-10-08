namespace StartLine.Domain.Plans;

internal enum DayRole
{
    Long,
    Quality,
    SecondQuality,
    Strides,
    Recovery,
    Easy,
}

/// <summary>
/// Decides what kind of run goes on each of the runner's chosen days. Hard days are kept at least
/// one day apart from each other and from the long run whenever the chosen days allow it.
/// </summary>
internal sealed record WeekLayout(IReadOnlyList<(int DayIndex, DayRole Role)> Days, bool HasAdjacentHardDays)
{
    public static WeekLayout For(IReadOnlyCollection<DayOfWeek> runDays, DayOfWeek longRunDay)
    {
        var longDay = MondayIndex(longRunDay);
        var others = runDays.Select(MondayIndex).Distinct().Where(d => d != longDay).Order().ToList();

        // Three runs a week get one hard session; four or more get two.
        var wanted = others.Count >= 3 ? 2 : 1;
        int[] quality = [];
        for (var count = wanted; count >= 1 && quality.Length == 0; count--)
        {
            quality = Combinations(others, count)
                .Where(combo => IsSpacedOut(combo, longDay))
                .OrderBy(combo => combo.Sum(d => DaysAfter(longDay, d)))
                .FirstOrDefault() ?? [];
        }

        var hasAdjacentHardDays = false;
        if (quality.Length == 0)
        {
            // Every chosen day touches the long run: use the one furthest from it and say so.
            quality = [others.OrderByDescending(d => Gap(d, longDay)).ThenBy(d => DaysAfter(longDay, d)).First()];
            hasAdjacentHardDays = true;
        }

        var roles = new Dictionary<int, DayRole> { [longDay] = DayRole.Long, [quality[0]] = DayRole.Quality };
        if (quality.Length > 1)
        {
            roles[quality[1]] = DayRole.SecondQuality;
        }

        // An easy day straight after a hard one is a recovery run. With only three runs there's no room for one.
        if (others.Count >= 3)
        {
            var hardDays = roles.Keys.ToList();
            foreach (var day in others.Where(d => !roles.ContainsKey(d) && hardDays.Contains((d + 6) % 7)))
            {
                roles[day] = DayRole.Recovery;
            }
        }

        var remaining = others.Where(d => !roles.ContainsKey(d)).ToList();
        if (quality.Length < 2 && remaining.Count > 0)
        {
            roles[remaining.OrderByDescending(d => Gap(d, longDay)).First()] = DayRole.Strides;
        }

        foreach (var day in others.Where(d => !roles.ContainsKey(d)))
        {
            roles[day] = DayRole.Easy;
        }

        return new WeekLayout([.. roles.OrderBy(r => r.Key).Select(r => (r.Key, r.Value))], hasAdjacentHardDays);
    }

    public static int MondayIndex(DayOfWeek day) => ((int)day + 6) % 7;

    private static int Gap(int a, int b)
    {
        var diff = Math.Abs(a - b);
        return Math.Min(diff, 7 - diff);
    }

    private static int DaysAfter(int from, int to) => (to - from + 7) % 7;

    private static bool IsSpacedOut(int[] hardDays, int longDay)
    {
        int[] all = [longDay, .. hardDays];
        for (var i = 0; i < all.Length; i++)
        {
            for (var j = i + 1; j < all.Length; j++)
            {
                if (Gap(all[i], all[j]) < 2)
                {
                    return false;
                }
            }
        }

        return true;
    }

    private static IEnumerable<int[]> Combinations(List<int> days, int size) => size switch
    {
        1 => days.Select(d => new[] { d }),
        _ => days.SelectMany((first, i) => days.Skip(i + 1).Select(second => new[] { first, second })),
    };
}
