import { KM_PER_MILE, type Units } from '../../lib/format'

/** Seconds per kilometre to cover <paramref name="distanceKm"/> in <paramref name="seconds"/>. */
export const paceFor = (distanceKm: number, seconds: number) => seconds / distanceKm

/** Seconds to cover <paramref name="distanceKm"/> at <paramref name="paceSecondsPerKm"/>. */
export const timeFor = (distanceKm: number, paceSecondsPerKm: number) => distanceKm * paceSecondsPerKm

/** A negative split runs the second half this much quicker than the first (and the first this much slower). */
export const NEGATIVE_SPLIT = 0.01

export interface Split {
  /** "1", "2"… or the part-unit at the end, as a distance in the chosen units ("0.2"). */
  label: string
  splitSeconds: number
  elapsedSeconds: number
}

/**
 * The split for every kilometre (or mile) of a race run in <paramref name="goalSeconds"/>, the last one partial. Even
 * pace, or a negative split: the first half 1% slower and the second 1% quicker, which still adds up to the goal.
 */
export function splits(distanceKm: number, goalSeconds: number, units: Units, negative = false): Split[] {
  if (distanceKm <= 0 || goalSeconds <= 0) return []
  const unitKm = units === 'mi' ? KM_PER_MILE : 1
  const pace = goalSeconds / distanceKm
  const half = distanceKm / 2
  const shift = negative ? NEGATIVE_SPLIT : 0
  const elapsed = (km: number) =>
    km <= half ? pace * (1 + shift) * km : pace * (1 + shift) * half + pace * (1 - shift) * (km - half)

  const result: Split[] = []
  for (let start = 0; start < distanceKm - 1e-9; start += unitKm) {
    const end = Math.min(distanceKm, start + unitKm)
    const part = (end - start) / unitKm
    result.push({
      label: part > 0.999 ? String(result.length + 1) : (Math.round(part * 10) / 10).toFixed(1),
      splitSeconds: elapsed(end) - elapsed(start),
      elapsedSeconds: elapsed(end),
    })
  }

  return result
}

export interface HeartRateZone {
  zone: number
  name: string
  low: number
  high: number
  feel: string
}

/** Five zones as shares of maximum heart rate: the most widely used scheme, and the one a watch is likeliest to show. */
const ZONES = [
  { name: 'Recovery', from: 0.5, to: 0.6, feel: 'Barely working. Warm-ups, cool-downs and the day after a hard one.' },
  { name: 'Easy', from: 0.6, to: 0.7, feel: 'Chatty. Most of your running belongs here.' },
  { name: 'Steady', from: 0.7, to: 0.8, feel: 'Comfortable but working. Marathon effort for many.' },
  { name: 'Threshold', from: 0.8, to: 0.9, feel: 'Comfortably hard. Tempo runs and cruise intervals.' },
  { name: 'Max', from: 0.9, to: 1, feel: 'Hard and short. Intervals and the final sprint.' },
] as const

export function heartRateZones(maxHeartRate: number): HeartRateZone[] {
  return ZONES.map((z, i) => ({
    zone: i + 1,
    name: z.name,
    low: Math.round(maxHeartRate * z.from),
    high: Math.round(maxHeartRate * z.to),
    feel: z.feel,
  }))
}

/** A typical gel: about 25 g of carbohydrate. */
export const GEL_GRAMS = 25

export interface Fuel {
  /** Grams of carbohydrate an hour, low to high; null when water is enough. */
  perHour: readonly [number, number] | null
  total: readonly [number, number] | null
  gels: readonly [number, number] | null
  advice: string
}

/**
 * Race-day carbohydrate, from how long the race will take: none needed under about 75 minutes, 30–60 g an hour up to
 * about two and a half hours, and 60–90 g beyond that for a gut that has practised it. The usual sports-nutrition guidance;
 * a runner's own gut has the final say.
 */
export function fuelling(durationSeconds: number): Fuel {
  const hours = durationSeconds / 3600
  if (hours < 1.25) {
    return { perHour: null, total: null, gels: null, advice: 'Water is plenty: under about 75 minutes, the fuel already in your muscles covers it.' }
  }

  const perHour = hours <= 2.5 ? ([30, 60] as const) : ([60, 90] as const)
  const total = [Math.round(perHour[0] * hours), Math.round(perHour[1] * hours)] as const
  return {
    perHour,
    total,
    gels: [Math.round(total[0] / GEL_GRAMS), Math.round(total[1] / GEL_GRAMS)] as const,
    advice:
      hours <= 2.5
        ? 'Start within the first 30 to 45 minutes and take a little often, with water.'
        : 'Start early and keep it steady. Go for the top of the range only if you’ve practised it on long runs.',
  }
}
