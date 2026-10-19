import { describe, expect, it } from 'vitest'
import type { Activity, PlannedVsActual } from '../../lib/types'
import longRun from '../../test/fixtures/activity-long-run.json'
import { actualLine, distanceDifference, halvesSummary, paceVerdict, plannedLine } from './activity-copy'

const plan = (longRun as Activity).plan!

describe('planned versus actual', () => {
  it('reads like the plan and the watch', () => {
    expect(plannedLine(plan, 'km')).toBe('14 km at 7:21–8:10/km')
    expect(actualLine(plan, 'km')).toBe('15.4 km at 6:40/km')
    expect(distanceDifference(plan, 'km')).toBe('+1.4 km')
  })

  it('says an easy day run fast was quicker, without telling anyone off', () => {
    expect(paceVerdict(plan, 'km')).toBe('42 s/km quicker than planned. Easy days do their job at an easy pace, so there’s no need to push them.')
    expect(paceVerdict({ ...plan, sessionType: 'Intervals' }, 'km')).toBe('42 s/km quicker than planned.')
  })

  it('converts the gap to miles for runners who use them', () => {
    expect(paceVerdict({ ...plan, sessionType: 'Tempo' }, 'mi')).toBe('68 s/mi quicker than planned.')
  })

  it('handles on-target, slower and no-target sessions', () => {
    const base: PlannedVsActual = { ...plan, secondsPerKmOffTarget: 0, pace: 'OnTarget' }
    expect(paceVerdict(base, 'km')).toBe('Right in the planned pace range.')
    expect(paceVerdict({ ...base, pace: 'Slower', secondsPerKmOffTarget: 9 }, 'km')).toBe('9 s/km slower than planned. Heat, hills and tired legs all count.')
    expect(paceVerdict({ ...base, pace: 'NoTarget' }, 'km')).toBe('No set pace for this one.')
    expect(plannedLine({ ...base, fastestPaceSecondsPerKm: null, slowestPaceSecondsPerKm: null }, 'km')).toBe('14 km')
    expect(distanceDifference({ ...base, distanceDifferenceKm: -0.04 }, 'km')).toBe('as planned')
    expect(distanceDifference({ ...base, distanceDifferenceKm: -0.3 }, 'km')).toBe('−0.3 km')
  })
})

describe('halves', () => {
  it('names the fade, the negative split and the even run', () => {
    const halves = (longRun as Activity).halves
    expect(halvesSummary({ ...halves, verdict: 'PositiveSplit', secondHalfSlowerBySecondsPerKm: 12.4 }, 'km')).toBe('Second half 12 s/km slower.')
    expect(halvesSummary({ ...halves, verdict: 'NegativeSplit', secondHalfSlowerBySecondsPerKm: -8 }, 'km')).toBe('Second half 8 s/km faster: a negative split.')
    expect(halvesSummary({ ...halves, verdict: 'Even', secondHalfSlowerBySecondsPerKm: 1 }, 'km')).toBe('Even halves: nicely paced.')
  })
})
