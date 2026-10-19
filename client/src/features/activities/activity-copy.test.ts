import { describe, expect, it } from 'vitest'
import type { Activity, PlannedVsActual } from '../../lib/types'
import longRunFixture from '../../test/fixtures/activity-long-run.json'
import tempoFixture from '../../test/fixtures/activity-tempo.json'
import { actualLine, distanceDifference, driftText, halvesSummary, plannedLine, runVerdict, splitFit } from './activity-copy'

// Real API responses: a Comrades long run run quicker than planned, and a tempo that started fast.
const longRun = longRunFixture as Activity
const tempo = tempoFixture as Activity
const plan = longRun.plan!

const with_ = (run: Activity, plan: Partial<PlannedVsActual>, review: Partial<Activity['review']> = {}): Activity => ({
  ...run,
  plan: { ...run.plan!, ...plan },
  review: { ...run.review, ...review },
})

describe('planned versus actual', () => {
  it('reads like the plan and the watch', () => {
    expect(plannedLine(plan, 'km')).toBe('14 km at 7:21–8:10/km')
    expect(actualLine(plan, 'km')).toBe('15.4 km at 6:40/km')
    expect(distanceDifference(plan, 'km')).toBe('+1.4 km')
  })

  it('describes a structured session by its work', () => {
    expect(plannedLine(tempo.plan!, 'km')).toBe('6.5 km with 3.2 km at 6:08–6:25/km')
    expect(plannedLine({ ...tempo.plan!, shape: 'Reps', workKm: 5, repMetres: 1000 }, 'km')).toBe('6.5 km with 5 × 1 km at 6:08–6:25/km')
    expect(plannedLine({ ...tempo.plan!, shape: 'ByEffort', targetFastestSecondsPerKm: null, targetSlowestSecondsPerKm: null }, 'km')).toBe('6.5 km')
  })

  it('says "as planned" within 100 m', () => {
    expect(distanceDifference({ ...plan, distanceDifferenceKm: -0.04 }, 'km')).toBe('as planned')
    expect(distanceDifference({ ...plan, distanceDifferenceKm: -0.3 }, 'km')).toBe('−0.3 km')
  })
})

describe('the verdict', () => {
  it('says a long run run fast was quicker than long-run pace, and what that means for next time', () => {
    const verdict = runVerdict(longRun, 'km')

    expect(verdict.headline).toBe('Long run, but quicker than long-run pace.')
    expect(verdict.details).toContain('42 s/km quicker than the plan’s range. Easy days do their job at an easy pace, so there’s no need to push them.')
    expect(verdict.details).toContain('21 s/km quicker than your goal pace of 7:00/km. Long runs build the most when they stay slower than race pace.')
    expect(verdict.next).toBe('Next up: Fartlek, Tuesday 5 January 2027. Start it at the slow end of its range.')
  })

  it('praises an easy run kept easy, and never scolds a slow one', () => {
    expect(runVerdict(with_(longRun, { pace: 'OnTarget', secondsPerKmOffTarget: 0, sessionType: 'Easy', title: 'Easy run' }, { goalPaceGapSecondsPerKm: null }), 'km').headline)
      .toBe('Easy run, kept easy.')
    const slow = runVerdict(with_(longRun, { pace: 'Slower', secondsPerKmOffTarget: 9, sessionType: 'Easy', title: 'Easy run' }, { goalPaceGapSecondsPerKm: null }), 'km')
    expect(slow.headline).toBe('Easy run, nice and gentle.')
    expect(slow.details[0]).toBe('9 s/km slower than the plan’s range, which is fine on an easy day.')
  })

  it('says a tempo started fast and then settled, judged on its work block', () => {
    const verdict = runVerdict(tempo, 'km')

    expect(verdict.headline).toBe('Tempo run started 14 s/km fast, then settled into range.')
    expect(verdict.details[0]).toBe('The 3.2 km of work averaged 6:10/km against 6:08–6:25/km.')
    expect(verdict.details).toContain('2.1 km longer than planned.')
    expect(verdict.next).toMatch(/^Next up: Recovery run, .+\. Start it at the slow end of its range\.$/)
  })

  it('names the km a session faded from', () => {
    expect(runVerdict(with_(tempo, { pace: 'Slower', secondsPerKmOffTarget: 6 }, { startedFastBySecondsPerKm: 12, fadeFromSplit: 5 }), 'km').headline)
      .toBe('Tempo run started 12 s/km fast and faded from km 5.')
    const faded = runVerdict(with_(tempo, { pace: 'Slower', secondsPerKmOffTarget: 6 }, { startedFastBySecondsPerKm: null, fadeFromSplit: 5 }), 'km')
    expect(faded.headline).toBe('Tempo run faded from km 5.')
    expect(faded.details).toContain('Heat, hills and tired legs all count.')
    expect(faded.next).toMatch(/Start a little steadier and see if the finish holds\.$/)
  })

  it('says hills go by feel', () => {
    const hills = runVerdict(with_(tempo, { title: 'Hill repeats', sessionType: 'Hills', shape: 'ByEffort', pace: 'NoTarget', judged: 'None' }, { startedFastBySecondsPerKm: null }), 'km')
    expect(hills.headline).toBe('Hill repeats done.')
    expect(hills.details[0]).toBe('Hills and fartlek go by feel, so there’s no pace to check.')
  })

  it('logs an unplanned run without judging it', () => {
    expect(runVerdict({ ...longRun, plan: null }, 'km')).toEqual({ headline: 'An extra run, logged.', details: [], next: null })
  })

  it('converts gaps to miles', () => {
    expect(runVerdict(longRun, 'mi').details[0]).toMatch(/^68 s\/mi quicker/)
  })
})

describe('heart rate and splits', () => {
  it('mentions notable drift neutrally', () => {
    expect(driftText(longRun)).toBe(
      'Heart rate rose 6.3% against pace from the first half to the second. Heat, fluids and tiredness all push it up, and it tends to shrink as your endurance builds.',
    )
    expect(driftText({ ...longRun, review: { ...longRun.review, heartRateDriftPercent: 2.1, heartRateDriftIsNotable: false } })).toBe(
      'Heart rate held steady against pace (2.1% drift).',
    )
    expect(driftText(tempo)).toBeNull()
  })

  it('labels each km against its zone', () => {
    expect(splitFit(longRun.splits[0]!)).toBe('31 s fast')
    expect(splitFit({ ...longRun.splits[0]!, fit: 'In' })).toBe('In zone')
    expect(splitFit({ ...longRun.splits[0]!, fit: 'Unscored' })).toBe('')
  })

  it('names the fade, the negative split and the even run', () => {
    const halves = longRun.halves
    expect(halvesSummary({ ...halves, verdict: 'PositiveSplit', secondHalfSlowerBySecondsPerKm: 12.4 }, 'km')).toBe('Second half 12 s/km slower.')
    expect(halvesSummary({ ...halves, verdict: 'NegativeSplit', secondHalfSlowerBySecondsPerKm: -8 }, 'km')).toBe('Second half 8 s/km faster: a negative split.')
    expect(halvesSummary({ ...halves, verdict: 'Even', secondHalfSlowerBySecondsPerKm: 1 }, 'km')).toBe('Even halves: nicely paced.')
  })
})
