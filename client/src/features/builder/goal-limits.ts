import { formatDistance, formatDuration, type Units } from '../../lib/format'

/**
 * The fastest time ever run at each distance, in seconds (track where it beats the road), as at November 2026:
 * mile 3:43.13, 3000 m 7:17.55, 5000 m 12:35.36, 10,000 m 26:11.00, half marathon 57:30, marathon 2:00:35,
 * 50 km 2:40:13, 100 km 6:05:35. The API holds the same table (GoalTimeRules.cs) as its hard floor.
 */
const RECORDS: readonly (readonly [km: number, seconds: number])[] = [
  [1.609344, 223.13],
  [3, 437.55],
  [5, 755.36],
  [10, 1571],
  [21.0975, 3450],
  [42.195, 7235],
  [50, 9613],
  [100, 21935],
]

/**
 * Elite level starts within 10% of the world record: a 13:51 5K, a 28:48 10K, a 63:15 half, a 2:12:39 marathon.
 * Taperday's plans are for everyday runners, so the builder stops a goal at that line.
 */
export const ELITE_FACTOR = 1.1

/** Slower than this is walking pace (15:00 per km), as the API also says. */
export const SLOWEST_SECONDS_PER_KM = 900

const between = (from: readonly [number, number], to: readonly [number, number], km: number) =>
  from[1] * (km / from[0]) ** (Math.log(to[1] / from[1]) / Math.log(to[0] / from[0]))

/** The world-record time for a distance, interpolated on a log-log scale between the records. */
export function worldRecordSeconds(km: number): number {
  const first = RECORDS[0]!
  if (km <= first[0]) return (first[1] * km) / first[0]
  for (let i = 1; i < RECORDS.length; i++) if (km <= RECORDS[i]![0]) return between(RECORDS[i - 1]!, RECORDS[i]!, km)
  return between(RECORDS.at(-2)!, RECORDS.at(-1)!, km)
}

/** The fastest goal the builder accepts for a distance: elite level, just outside it. */
export const eliteLimitSeconds = (km: number) => worldRecordSeconds(km) * ELITE_FACTOR

/** Why a goal can't be used, or null when it's a time an everyday runner could aim for. */
export function goalProblem(km: number, seconds: number, units: Units): string | null {
  if (!(km > 0) || !(seconds > 0)) return null
  const limit = Math.ceil(eliteLimitSeconds(km))
  if (seconds < limit) {
    return seconds < worldRecordSeconds(km)
      ? `${formatDuration(seconds)} is faster than the world record for ${formatDistance(km, units)}. Choose a time you could really run.`
      : `${formatDuration(seconds)} is an elite time for ${formatDistance(km, units)}. Taperday plans are for everyday runners, so choose ${formatDuration(limit)} or slower.`
  }
  if (seconds / km > SLOWEST_SECONDS_PER_KM) return `That’s slower than walking pace for ${formatDistance(km, units)}. Check the hours, minutes and seconds.`
  return null
}
