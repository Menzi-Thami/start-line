import type { CheckIn, CheckInRequest, SessionType } from '../../lib/types'

// The service worker still caches no account data. This device copy contains only the runner's own answers and
// identifiers, never imported activity measurements, provider credentials or access tokens.
const KEY = 'taperday:check-ins:v1'
const EVENT = 'taperday:check-ins-changed'

export const checkInKey = (entry: Pick<CheckIn, 'date' | 'sessionType' | 'id' | 'isAdditional'>) =>
  entry.isAdditional ? entry.id! : `${entry.date}|${entry.sessionType}`

export interface PendingCheckIn {
  revision: string
  key: string
  date: string
  sessionType: SessionType
  additionalId?: string
  /** The server copy last seen, so reconnecting cannot silently replace a newer answer. */
  base: CheckIn | null
  /** Null takes back the entry. PUT and DELETE use stable identities and can safely be retried. */
  answers: CheckInRequest | null
}

export interface CheckInCopy {
  entries: CheckIn[]
  pending: PendingCheckIn[]
  revision?: number
}

interface Stored { owner: string; plans: Record<string, CheckInCopy> }
const EMPTY_PLANS: Record<string, CheckInCopy> = {}
let lastRaw: string | null = null
let lastStored: Stored | null = null

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === lastRaw) return lastStored
    const stored: Stored | null = raw ? JSON.parse(raw) : null
    lastRaw = raw
    lastStored = stored && typeof stored.owner === 'string' && stored.plans && typeof stored.plans === 'object' ? stored : null
    return lastStored
  } catch { return null }
}

export function readCheckInCopy(owner: string, planId: string): CheckInCopy | null {
  const stored = read()
  const plan = stored?.owner === owner ? stored.plans[planId] : null
  return plan && Array.isArray(plan.entries) && Array.isArray(plan.pending) ? plan : null
}

export function readCheckInCopies(owner: string | null): Record<string, CheckInCopy> {
  const stored = read()
  return stored?.owner === owner ? stored.plans : EMPTY_PLANS
}

/** Unsynced drafts on this device, whoever they belong to. Checked before anything that could replace their owner. */
export function pendingDraftCount(): number {
  const plans = read()?.plans ?? EMPTY_PLANS
  return Object.values(plans).reduce((sum, copy) => sum + (Array.isArray(copy?.pending) ? copy.pending.length : 0), 0)
}

/** A blocked/full store is an error for a queued save: never claim an unsent answer has been saved. */
export function writeCheckInCopy(owner: string, planId: string, copy: CheckInCopy): void {
  const previous = read()
  const plans = previous?.owner === owner ? previous.plans : {}
  try {
    localStorage.setItem(KEY, JSON.stringify({ owner, plans: { ...plans,
      [planId]: { ...copy, revision: (plans[planId]?.revision ?? 0) + 1 },
    } } satisfies Stored))
  } catch {
    throw new Error('This device couldn’t keep your run. Free some storage or reconnect, then save again; your form is still here.')
  }
  window.dispatchEvent(new Event(EVENT))
}

export function clearCheckInCopies(): void {
  try { localStorage.removeItem(KEY) } catch { /* Storage may already be unavailable. */ }
  window.dispatchEvent(new Event(EVENT))
}

/** One remembered runner per device; another sign-in cannot reveal or submit the previous runner's queue. */
export function activateCheckInOwner(owner: string | null): void {
  const stored = read()
  if (stored && stored.owner !== owner) clearCheckInCopies()
}

export function subscribeCheckInCopies(listener: () => void): () => void {
  const changed = (event: StorageEvent) => { if (event.key === KEY || event.key === null) listener() }
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', changed)
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', changed) }
}

export function pendingEntry(change: PendingCheckIn): CheckIn | null {
  if (!change.answers) return null
  const a = change.answers
  return {
    ...change.base, date: change.date, sessionType: change.sessionType,
    id: change.additionalId ?? change.base?.id ?? `pending:${change.key}`, isAdditional: !!change.additionalId,
    status: a.status, effort: a.effort, pain: a.pain ?? 'None', painArea: a.painArea ?? null,
    distanceKm: a.distanceKm ?? null, duration: a.duration ?? null, note: a.note ?? null,
    actualSessionType: a.actualSessionType ?? null, distanceUnreported: a.distanceUnreported,
    activityId: null, updatedAt: change.base?.updatedAt ?? '',
  }
}

export function visibleCheckIns(copy: CheckInCopy): CheckIn[] {
  const entries = new Map(copy.entries.map(entry => [checkInKey(entry), entry]))
  for (const change of copy.pending) {
    const entry = pendingEntry(change)
    if (entry) entries.set(change.key, entry)
    else entries.delete(change.key)
  }
  return [...entries.values()]
}

/** Compare own answers only, allowing a response lost after a committed save to be acknowledged on retry. */
export function sameCheckIn(a: CheckIn | null | undefined, b: CheckIn | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return ['date', 'sessionType', 'status', 'effort', 'pain', 'painArea', 'distanceKm', 'duration', 'note',
    'actualSessionType', 'activityId'].every(field => (a[field as keyof CheckIn] ?? null) === (b[field as keyof CheckIn] ?? null))
    && !!a.distanceUnreported === !!b.distanceUnreported
}
