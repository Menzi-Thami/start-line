import type { CurrentPlan } from '../features/account/useCurrentPlan'
import type { ActivitySummary, PersonalBest, Runner, StravaStatus, TrainingPlan } from './types'

/**
 * A copy of the runner's last-seen Home on this device, so a signed-in runner sees it straight away while the free
 * database wakes (about 45 seconds after a quiet hour), and it updates in place once the real answers arrive. It's a
 * convenience, never a source of truth: nothing is saved from it, and anything that can't be read cleanly is ignored.
 *
 * What it keeps, on purpose, is only what Home shows: the runner's name and units, their current plan, recent runs,
 * bests and whether Strava is connected. Never their email or heart rate. It belongs to one account (by a fingerprint of
 * it, not the address itself), is cleared on sign-out, and is dropped after a week, with Strava runs older than seven
 * days left out, the same as Taperday keeps them (Strava's terms).
 */
export interface HomeSnapshot {
  savedAt: string
  runner?: Runner
  current?: CurrentPlan | null
  plan?: { id: string; plan: TrainingPlan } | null
  runs?: ActivitySummary[]
  bests?: PersonalBest[]
  strava?: StravaStatus
}

const KEY = 'startline:home'
const VERSION = 1

/** A week: after that the copy says more about the past than about today. */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Strava runs stay on Taperday for seven days, as Strava asks; the copy keeps to the same rule. */
const STRAVA_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** Which account a copy belongs to, without keeping the account's address on the device. */
export function ownerOf(account: { name: string; email: string | null }): string {
  const text = (account.email ?? account.name).trim().toLowerCase()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

interface Stored {
  v: number
  owner: string
  snapshot: HomeSnapshot
}

function load(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    return parsed && parsed.v === VERSION && typeof parsed.owner === 'string' && parsed.snapshot && typeof parsed.snapshot.savedAt === 'string'
      ? parsed
      : null
  } catch {
    return null
  }
}

const freshRuns = (runs: ActivitySummary[] | undefined, now: Date) =>
  runs
    ?.filter((r) => r.source.kind !== 'Strava' || now.getTime() - new Date(r.startedAt).getTime() <= STRAVA_DAYS_MS)
    .map((r) => ({ ...r, averageHeartRate: null }))

/** The copy for this account, if there's a usable one. A copy for anyone else, or a stale one, is removed. */
export function readSnapshot(owner: string, now: Date = new Date()): HomeSnapshot | null {
  const stored = load()
  if (!stored) return null
  const age = now.getTime() - new Date(stored.snapshot.savedAt).getTime()
  if (stored.owner !== owner || !(age >= 0 && age <= SNAPSHOT_MAX_AGE_MS)) {
    clearSnapshot()
    return null
  }
  return { ...stored.snapshot, runs: freshRuns(stored.snapshot.runs, now) }
}

/** Adds what's just been loaded to the copy. Storage that's blocked or full simply means no copy. */
export function saveSnapshot(owner: string, part: Omit<HomeSnapshot, 'savedAt'>, now: Date = new Date()): void {
  const previous = load()
  const base = previous && previous.owner === owner ? previous.snapshot : { savedAt: now.toISOString() }
  const runner = part.runner ? { ...part.runner, email: null, maxHeartRate: null } : undefined
  const snapshot: HomeSnapshot = {
    ...base,
    ...part,
    ...(runner ? { runner } : {}),
    ...(part.runs ? { runs: freshRuns(part.runs, now) } : {}),
    savedAt: now.toISOString(),
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, owner, snapshot } satisfies Stored))
  } catch {
    // No copy this time: Home still loads, it just waits for the database.
  }
}

export function clearSnapshot(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing stored, or storage unavailable: nothing to clear.
  }
}
