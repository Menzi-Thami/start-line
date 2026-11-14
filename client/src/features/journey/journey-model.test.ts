import { describe, expect, it } from 'vitest'
import type { TrainingPlan } from '../../lib/types'
import { chapter, journeyOf, raceResult, recap, recovery } from './journey-fixtures'
import type { Journey } from './types'
import {
  chapterFor,
  clockSeconds,
  isJourneyPayload,
  distanceBadge,
  finishStage,
  formatClock,
  owedCelebration,
  planRunDays,
  recoveryDayMap,
  recoveryFor,
  recoveryWelcome,
  versusGoalWords,
  weekOf,
} from './journey-model'
import { highlights, storyFromChapter } from './journey-story'

const award = (kind: 'TrainingComplete' | 'RaceFinished', celebratedAt: string | null = null) =>
  ({ id: `${kind}-id`, kind, planId: chapter().planId, earnedOn: '2026-11-14', awardedAt: '2026-11-14T10:00:00Z', celebratedAt })

describe('finish stage: never inferred from a date alone', () => {
  it('stays in training while runs are unconfirmed and the race is ahead', () => {
    expect(finishStage(chapter({ training: recap({ allConfirmed: false, confirmedRuns: 30 }) }), '2026-11-10')).toBe('training')
  })
  it('celebrates training, not the race, when every run is confirmed before race day', () => {
    expect(finishStage(chapter(), '2026-11-14')).toBe('training-complete')
  })
  it('asks how race day went, on the day and afterwards, instead of assuming a finish', () => {
    expect(finishStage(chapter(), '2026-11-15')).toBe('race-day')
    expect(finishStage(chapter({ training: recap({ raceDatePassed: true }) }), '2026-11-16')).toBe('race-result-needed')
  })
  it('asks even when training ended yesterday with nothing confirmed, and never says complete', () => {
    const empty = chapter({ training: recap({ confirmedRuns: 0, allConfirmed: false, raceDatePassed: true, recordedKm: null }) })
    expect(finishStage(empty, '2026-11-16')).toBe('race-result-needed')
    expect(storyFromChapter(empty).earned).toBe(false)
  })
  it('is recorded once the runner saved a result, whatever the outcome', () => {
    expect(finishStage(chapter({ raceResult: raceResult({ outcome: 'DidNotStart', finishTime: null }) }), '2026-11-16')).toBe('race-recorded')
  })
})

describe('celebrations play once, current plan only', () => {
  it('owes the race film before the training film', () => {
    expect(owedCelebration(chapter({ achievements: [award('TrainingComplete'), award('RaceFinished')] }))?.kind).toBe('RaceFinished')
  })
  it('owes nothing once seen, and never auto-plays on a past plan', () => {
    expect(owedCelebration(chapter({ achievements: [award('TrainingComplete', '2026-11-14T11:00:00Z')] }))).toBeNull()
    expect(owedCelebration(chapter({ status: 'Archived', achievements: [award('TrainingComplete')] }))).toBeNull()
  })
})

describe('recovery on the calendar', () => {
  it('marks only the recovery plan’s own days, and none after it ends early', () => {
    const ended = recovery({ status: 'Ended', endedOn: '2026-11-18' })
    expect(recoveryDayMap(ended).size).toBe(0)
    const early = recovery({ status: 'Completed', endedOn: '2026-11-18' })
    expect([...recoveryDayMap(early).keys()].at(-1)).toBe('2026-11-18')
    expect(recoveryDayMap(recovery()).has('2026-11-26')).toBe(false)
  })
  it('belongs to its own race, or shows everywhere for a race outside Taperday', () => {
    expect(recoveryFor(journeyOf([], { recovery: recovery() }), 'another-plan')).toBeNull()
    expect(recoveryFor(journeyOf([], { recovery: recovery({ planId: null }) }), 'another-plan')).not.toBeNull()
  })
  it('is only offered after a race actually run', () => {
    expect(recoveryWelcome('Finished')).toBe(true)
    expect(recoveryWelcome('DidNotFinish')).toBe(true)
    expect(recoveryWelcome('DidNotStart')).toBe(false)
    expect(recoveryWelcome(undefined)).toBe(false)
  })
})

describe('race clock and goal words', () => {
  it('reads .NET time spans, including days and negatives', () => {
    expect(clockSeconds('01:52:10')).toBe(6730)
    expect(clockSeconds('1.02:10:00')).toBe(94200)
    expect(clockSeconds('-00:02:50')).toBe(-170)
    expect(formatClock('00:48:05')).toBe('48:05')
    expect(formatClock('1.02:10:00')).toBe('26:10:00')
  })
  it('is kind about a slower result and silent for DNF or DNS', () => {
    expect(versusGoalWords(raceResult())).toBe('2:50 faster than your 1:55:00 goal.')
    expect(versusGoalWords(raceResult({ versusGoal: '00:06:30' }))).toMatch(/^6:30 over your 1:55:00 goal\. Every finish line counts/)
    expect(versusGoalWords(raceResult({ versusGoal: '00:00:00' }))).toBe('Right on your 1:55:00 goal.')
    expect(versusGoalWords(raceResult({ outcome: 'DidNotFinish' }))).toBeNull()
  })
})

describe('honest highlights', () => {
  it('never claims every run when some were missed or cut short', () => {
    const lines = highlights(storyFromChapter(chapter({ training: recap({ allConfirmed: false, confirmedRuns: 30, cutShortRuns: 2 }), achievements: [] })))
    expect(lines[0]).toBe('79% of planned training runs confirmed.')
    expect(lines.join(' ')).toContain('2 runs cut short')
    expect(lines.join(' ')).not.toContain('Every planned')
  })
})

describe('helpers', () => {
  it('finds the run days the plan used, Monday first, without strength or race', () => {
    const plan = { weeks: [{ sessions: [
      { date: '2026-11-08', type: 'LongRun' }, { date: '2026-11-03', type: 'Easy' }, { date: '2026-11-04', type: 'Strength' }, { date: '2026-11-15', type: 'Race' },
    ] }] } as unknown as TrainingPlan
    expect(planRunDays(plan)).toEqual(['Tuesday', 'Sunday'])
  })
  it('names standard distances on badges', () => {
    expect(distanceBadge(21.0975)).toBe('Half')
    expect(distanceBadge(42.195)).toBe('Marathon')
    expect(distanceBadge(56)).toBe('56K')
  })
  it('gives Monday-first weeks across a month end', () => {
    expect(weekOf('2026-12-01')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'])
  })
})

describe('unavailable journey API does not crash existing pages', () => {
  it('rejects malformed or legacy API responses instead of rendering them as a journey', () => {
    expect(isJourneyPayload([])).toBe(false)
    expect(isJourneyPayload(null)).toBe(false)
    expect(isJourneyPayload({ chapters: 'wrong', recovery: null, maintenance: null })).toBe(false)
    expect(isJourneyPayload({ chapters: [], recovery: null, maintenance: null })).toBe(true)
  })
  it('does not access chapters on missing or malformed journey data', () => {
    expect(chapterFor(null, 'plan-id')).toBeNull()
    expect(chapterFor([] as unknown as Journey, 'plan-id')).toBeNull()
  })
})
