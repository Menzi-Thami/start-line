import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '../../lib/types'
import { milestonesFromRuns } from './milestones'

const run = (id: string, localDate: string, distanceKm: number): ActivitySummary => ({
  id, localDate, distanceKm, startedAt: localDate + 'T06:00:00Z',
  kind: 'Run', movingSeconds: 1800, paceSecondsPerKm: 300,
  plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
  source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null },
})

describe('record-limited sharing milestones', () => {
  it('uses only positive measured distances and reports scope honestly', () => {
    const found = milestonesFromRuns([run('1','2026-10-26',5),run('2','2026-11-01',10),run('3','2026-11-02',8),run('4','2026-11-03',0)])
    expect(found.find(x => x.id === 'longest')?.value).toBe(10)
    expect(found.find(x => x.id === 'weekly-distance')?.value).toBe(15)
    expect(found.find(x => x.id === 'consistency')?.value).toBe(2)
    expect(found[0]?.title).toContain('in your records')
    expect(found.every(x => x.evidenceCount === 3)).toBe(true)
  })
  it('ignores impossible calendar dates instead of crashing', () => {
    const found = milestonesFromRuns([run('bad', '2026-13-42', 100), run('valid', '2026-11-01', 7)])
    expect(found.find(item => item.id === 'longest')?.value).toBe(7)
  })
  it('does not invent streaks or milestones when records are missing', () => {
    expect(milestonesFromRuns([])).toEqual([])
    expect(milestonesFromRuns([run('x','2026-10-26',8)]).some(x=>x.id==='consistency')).toBe(false)
  })
})
