import { describe, expect, it } from 'vitest'
import type { ActivitySummary, CheckIn, Session } from '../../lib/types'
import { planFixture } from '../../test/server'
import { reviewLine, reviewWeek, weekAhead, type CheckInFor } from './week-review'

// The fixture is a 5K plan: week 1 from Monday 12 October (hills Tue, easy+strides Thu, easy Sat, long run 6 km Sun),
// week 2 from 19 October (17.5 km then 23.5 km), week 4 a cutback, week 9 race week with the race on 13 December.
const week = (n: number) => planFixture.weeks.find((w) => w.number === n)!

const run = (localDate: string, distanceKm: number): ActivitySummary =>
  ({ id: `${localDate}-${distanceKm}`, startedAt: `${localDate}T06:00:00Z`, localDate, kind: 'Run', distanceKm, source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null } }) as unknown as ActivitySummary

const checkIn = (date: string, sessionType: Session['type'], answers: Partial<CheckIn> = {}): CheckIn =>
  ({ date, sessionType, status: 'Done', effort: null, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null, updatedAt: `${date}T08:00:00Z`, ...answers }) as CheckIn

const checkIns = (...list: CheckIn[]): CheckInFor => (s) => list.find((c) => c.date === s.date && c.sessionType === s.type)

describe('reviewWeek', () => {
  it('includes additional uploaded distance without completing the prescribed run', () => {
    const uploaded = run('2026-10-18', 10)
    const additional = checkIn('2026-10-18', 'Easy', { id: 'extra', activityId: uploaded.id, isAdditional: true, distanceKm: 10 })
    const review = reviewWeek(week(1), [uploaded], '2026-10-20', () => undefined, [additional])
    expect(review.ranKm).toBe(10)
    expect(review.doneRuns).toBe(0)
    expect(review.longRun).toMatchObject({ done: false, ranKm: null })
  })
  it('a full week: every run done, the distance and the long run', () => {
    const runs = [run('2026-10-13', 5.6), run('2026-10-15', 3.1), run('2026-10-17', 3), run('2026-10-18', 6.4)]

    const review = reviewWeek(week(1), runs, '2026-10-20')

    expect(review).toMatchObject({ dueRuns: 4, doneRuns: 4, plannedKm: 17.5, ranKm: 18.1, missed: [], finished: true, feel: null, checkedIn: 0 })
    expect(review.longRun).toMatchObject({ done: true, ranKm: 6.4 })
    expect(reviewLine(review, 'km')).toBe('Ran 4 of 4 runs · 18.1 of 17.5 km')
  })

  it('names the runs that were missed, and a missed long run', () => {
    const review = reviewWeek(week(1), [run('2026-10-13', 5.5), run('2026-10-15', 3)], '2026-10-20')

    expect(review.doneRuns).toBe(2)
    expect(review.missed.map((s) => s.title)).toEqual(['Easy run', 'Long run'])
    expect(review.longRun).toMatchObject({ done: false, ranKm: null })
  })

  it('without check-ins says nothing of how it felt; with them, the hard sessions decide', () => {
    const runs = [run('2026-10-13', 5.5)]
    expect(reviewWeek(week(1), runs, '2026-10-20').feel).toBeNull()

    // Hills should feel 7–8: a 9 is harder than it should be.
    const harder = reviewWeek(week(1), runs, '2026-10-20', checkIns(checkIn('2026-10-13', 'Hills', { effort: 9 })))
    expect(harder.feel).toBe('harder')
    expect(harder.checkedIn).toBe(1)
    expect(reviewLine(harder, 'km')).toContain('Hard sessions felt harder than they should')

    const easier = reviewWeek(week(1), runs, '2026-10-20', checkIns(checkIn('2026-10-13', 'Hills', { effort: 5 })))
    expect(easier.feel).toBe('easier')
  })

  it('a check-in that says a run was done counts it, with the distance it gave', () => {
    const review = reviewWeek(week(1), [], '2026-10-20', checkIns(checkIn('2026-10-15', 'EasyWithStrides', { distanceKm: 3.2 }), checkIn('2026-10-17', 'Easy', { status: 'Skipped' })))

    expect(review.doneRuns).toBe(1)
    expect(review.ranKm).toBe(3.2)
    expect(review.missed.map((s) => s.type)).toEqual(['Hills', 'Easy', 'LongRun'])
  })

  it('notes pain from any check-in', () => {
    const review = reviewWeek(week(1), [], '2026-10-20', checkIns(checkIn('2026-10-13', 'Hills', { pain: 'Niggle', painArea: 'Calf' })))

    expect(review.pain).toBe(true)
  })

  it('a week in progress only counts the days that have come, and today’s once it’s done', () => {
    // Thursday 22nd: the fartlek (Tue) is due; today's progression run isn't run yet, so it isn't a miss.
    const review = reviewWeek(week(2), [run('2026-10-20', 6.5)], '2026-10-22')

    expect(review).toMatchObject({ dueRuns: 1, doneRuns: 1, missed: [], finished: false, longRun: null, plannedKm: 23.5 })
    expect(reviewWeek(week(2), [run('2026-10-20', 6.5), run('2026-10-22', 7.4)], '2026-10-22')).toMatchObject({ dueRuns: 2, doneRuns: 2, ranKm: 13.9 })
  })

  it('race week leaves the race out, as the weekly total does', () => {
    const runs = [run('2026-12-08', 6.5), run('2026-12-10', 5), run('2026-12-12', 5), run('2026-12-13', 5)]

    const review = reviewWeek(week(9), runs, '2026-12-14')

    expect(review).toMatchObject({ dueRuns: 3, doneRuns: 3, plannedKm: 16.5, ranKm: 16.5, longRun: null })
  })
})

describe('weekAhead', () => {
  it('the first week has nothing to compare with', () => {
    const ahead = weekAhead(planFixture, week(1))

    expect(ahead.changeKm).toBeNull()
    expect(ahead.keySessions.map((s) => s.title)).toEqual(['Hill repeats'])
    expect(ahead.longRun?.distanceKm).toBe(6)
  })

  it('a build week says how much more it asks', () => {
    const ahead = weekAhead(planFixture, week(2))

    expect(ahead.plannedKm).toBe(23.5)
    expect(ahead.changeKm).toBe(6)
    expect(ahead.keySessions.map((s) => s.type)).toEqual(['Fartlek', 'ProgressionRun'])
  })

  it('a cutback week is less, with no hard sessions', () => {
    const ahead = weekAhead(planFixture, week(4))

    expect(ahead.changeKm).toBe(-4)
    expect(ahead.keySessions).toEqual([])
    expect(ahead.longRun?.distanceKm).toBe(5.5)
  })

  it('race week has the race', () => {
    const ahead = weekAhead(planFixture, week(9))

    expect(ahead.race?.date).toBe('2026-12-13')
    expect(ahead.keySessions.map((s) => s.type)).toEqual(['RacePace'])
  })
})
