import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '../../lib/types'
import { calendarDaysEnding, comparablePaceGroups } from './progress-evidence'
const run = (patch: Partial<ActivitySummary> = {}) => ({ id: 'one', localDate: '2026-11-02', plannedSessionType: 'Easy', distanceKm: 5, movingSeconds: 1500, paceSecondsPerKm: 300, source: { kind: 'Upload' }, ...patch }) as ActivitySummary

describe('comparable progress evidence', () => {
  it('keeps session type, approximate distance and source separate', () => {
    const groups = comparablePaceGroups([run(), run({ id: 'two', localDate: '2026-11-04' }), run({ id: 'three', plannedSessionType: 'Recovery' }), run({ id: 'four', distanceKm: 10 }), run({ id: 'five', source: { kind: 'Strava' } as ActivitySummary['source'] })], '2026-10-01', '2026-11-04')
    expect(groups).toHaveLength(4)
    expect(groups[0]!.records.map(item => item.id)).toEqual(['one', 'two'])
  })
  it('does not treat missing data, unplanned runs or future data as comparable fitness evidence', () => {
    expect(comparablePaceGroups([run({ plannedSessionType: null }), run({ paceSecondsPerKm: NaN }), run({ localDate: '2026-12-01' }), run({ movingSeconds: 0 })], '2026-10-01', '2026-11-04')).toEqual([])
  })
  it('uses calendar days across a daylight-saving boundary', () => {
    expect(calendarDaysEnding('2027-03-15', 3)).toEqual(['2027-03-13', '2027-03-14', '2027-03-15'])
  })
})
