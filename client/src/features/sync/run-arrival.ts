/** Identify a genuinely new, recent Strava import without persisting provider data
 * or showing the same notification for a refresh of an older cached run. */
export type ArrivalCandidate = {
  id: string
  startedAt: string
  source: { kind: string; addedAt?: string | null }
}

export function findNewStravaArrival<T extends ArrivalCandidate>(
  previous: ReadonlySet<string> | null,
  runs: readonly T[],
  now = Date.now(),
): T | null {
  const windowMs = 30 * 60_000
  const maxRunAgeMs = 48 * 60 * 60_000
  const unseen = runs.filter(run => {
    if (run.source.kind !== 'Strava' || previous?.has(run.id)) return false
    const importedAt = Date.parse(run.source.addedAt ?? '')
    const startedAt = Date.parse(run.startedAt)
    return Number.isFinite(importedAt) && importedAt <= now && now - importedAt <= windowMs
      && Number.isFinite(startedAt) && startedAt <= now && now - startedAt <= maxRunAgeMs
  })
  // Importing a batch should produce one useful notification rather than a toast for every activity.
  return unseen.sort((a, b) => Date.parse(b.source.addedAt ?? '') - Date.parse(a.source.addedAt ?? ''))[0] ?? null
}
