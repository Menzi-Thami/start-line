import { afterEach, describe, expect, it } from 'vitest'
import { clearSnapshot, ownerOf, readSnapshot, saveSnapshot, SNAPSHOT_MAX_AGE_MS } from './home-snapshot'
import type { ActivitySummary, Runner } from './types'

const thandi = { id: 'runner-1', displayName: 'Thandi', email: 'thandi@example.com', maxHeartRate: 190 } as Runner
const me = ownerOf({ name: 'Thandi', email: 'thandi@example.com' })
const now = new Date('2026-10-24T08:00:00Z')

const run = (startedAt: string, kind: 'Upload' | 'Strava') =>
  ({ id: startedAt, startedAt, localDate: startedAt.slice(0, 10), averageHeartRate: 150, source: { kind, viewUrl: null } }) as unknown as ActivitySummary

afterEach(() => window.localStorage.clear())

describe('the copy of Home kept on this device', () => {
  it('keeps what Home shows, but never the runner’s email or heart rate', () => {
    saveSnapshot(me, { runner: thandi, runs: [run('2026-10-23T06:00:00Z', 'Upload')] }, now)

    const copy = readSnapshot(me, now)!
    expect(copy.runner?.displayName).toBe('Thandi')
    expect(copy.runner?.email).toBeNull()
    expect(copy.runner?.maxHeartRate).toBeNull()
    expect(copy.runs?.[0]?.averageHeartRate).toBeNull()
    expect(window.localStorage.getItem('startline:home')).not.toContain('thandi@example.com')
  })

  it('adds each piece as it loads, without losing the others', () => {
    saveSnapshot(me, { runner: thandi }, now)
    saveSnapshot(me, { current: null }, now)

    const copy = readSnapshot(me, now)!
    expect(copy.runner?.displayName).toBe('Thandi')
    expect(copy.current).toBeNull()
  })

  it('belongs to one account: anyone else signing in on this device never sees it', () => {
    saveSnapshot(me, { runner: thandi }, now)

    expect(readSnapshot(ownerOf({ name: 'Sipho', email: 'sipho@example.com' }), now)).toBeNull()
    // And it's gone, not just hidden.
    expect(readSnapshot(me, now)).toBeNull()
  })

  it('is dropped after a week', () => {
    saveSnapshot(me, { runner: thandi }, now)

    expect(readSnapshot(me, new Date(now.getTime() + SNAPSHOT_MAX_AGE_MS + 1))).toBeNull()
  })

  it('leaves out Strava runs older than seven days, as Taperday does, and keeps uploads', () => {
    saveSnapshot(me, { runs: [run('2026-10-23T06:00:00Z', 'Strava'), run('2026-10-10T06:00:00Z', 'Strava'), run('2026-10-10T07:00:00Z', 'Upload')] }, now)

    expect(readSnapshot(me, now)!.runs!.map((r) => r.id)).toEqual(['2026-10-23T06:00:00Z', '2026-10-10T07:00:00Z'])
  })

  it('ignores anything it can’t read, and is cleared on demand', () => {
    window.localStorage.setItem('startline:home', '{not json')
    expect(readSnapshot(me, now)).toBeNull()

    saveSnapshot(me, { runner: thandi }, now)
    clearSnapshot()
    expect(readSnapshot(me, now)).toBeNull()
  })
})
