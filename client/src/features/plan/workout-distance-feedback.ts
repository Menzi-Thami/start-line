/**
 * Deterministic, ephemeral distance comparison for a recorded run against one planned session.
 * This is NOT a stage/pace analysis and never infers a runner's check-in answer.
 * Compute from currently available activity data; do not persist Strava-derived results.
 */
export type DistanceEvidence =
  | { kind: 'unavailable'; label: string }
  | { kind: 'recorded'; label: string; plannedKm: number; recordedKm: number; fraction: number; differenceKm: number; withinTolerance: boolean }

export function compareWorkoutDistance(plannedKm: number | null | undefined, recordedKm: number | null | undefined): DistanceEvidence {
  if (plannedKm == null || !Number.isFinite(plannedKm) || plannedKm <= 0) {
    return { kind: 'unavailable', label: 'No planned distance to compare' }
  }
  if (recordedKm == null || !Number.isFinite(recordedKm) || recordedKm < 0) {
    return { kind: 'unavailable', label: 'Recorded distance unavailable' }
  }
  // A distance match is NOT evidence of following the warm-up, intervals or prescribed pace.
  const differenceKm = recordedKm - plannedKm
  const fraction = recordedKm / plannedKm
  const withinTolerance = Math.abs(differenceKm) <= Math.max(0.2, plannedKm * 0.05)
  const label = withinTolerance
    ? 'Recorded distance is close to the planned distance; workout structure not assessed'
    : differenceKm < 0
      ? 'Recorded distance is shorter than planned; workout structure not assessed'
      : 'Recorded distance is longer than planned; workout structure not assessed'
  return { kind: 'recorded', label, plannedKm, recordedKm, fraction, differenceKm, withinTolerance }
}
