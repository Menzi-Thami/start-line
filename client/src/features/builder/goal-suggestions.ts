/** A one-tap goal for a runner who isn't sure what to aim for. */
export interface GoalSuggestion {
  id: 'comfortable' | 'steady' | 'quick'
  label: string
  seconds: number
}

/**
 * Three everyday starting points, as 5K times: a comfortable first finish, a steady middle and a quick one. Longer races
 * scale from these the way race times really stretch with distance (Riegel's rule, time × distance^1.06).
 */
const LEVELS: readonly { id: GoalSuggestion['id']; label: string; fiveKSeconds: number; ultraPace: number }[] = [
  { id: 'comfortable', label: 'Comfortable', fiveKSeconds: 34 * 60, ultraPace: 7 * 60 + 20 },
  { id: 'steady', label: 'Steady', fiveKSeconds: 29 * 60, ultraPace: 6 * 60 + 30 },
  { id: 'quick', label: 'Quick', fiveKSeconds: 25 * 60, ultraPace: 5 * 60 + 45 },
]

const MARATHON_KM = 42.195

/** Whole minutes under an hour, five-minute steps above: a goal people say out loud. */
function tidy(seconds: number): number {
  const step = seconds < 3600 ? 60 : 300
  return Math.round(seconds / step) * step
}

/**
 * Goal times to offer for a distance. Up to the marathon they scale from the 5K levels; ultras go by an average pace
 * that already allows for hills and walking (7:20, 6:30 and 5:45 per km), since the scaling rule runs optimistic there.
 */
export function suggestedGoals(km: number): GoalSuggestion[] {
  if (!(km > 0)) return []
  return LEVELS.map(({ id, label, fiveKSeconds, ultraPace }) => ({
    id,
    label,
    seconds: tidy(km > MARATHON_KM + 0.5 ? ultraPace * km : fiveKSeconds * (km / 5) ** 1.06),
  }))
}
