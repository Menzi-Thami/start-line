import { expect, it } from 'vitest'
import { planFixture } from '../test/server'
import type { ActivitySummary, CheckIn } from './types'
import { ranKmByWeek } from './plan-runs'

it('counts a manual replacement once, includes an additional run, and leaves time-only distance unknown', () => {
  const week = planFixture.weeks[0]!
  const session = week.sessions.find((s) => s.type !== 'Strength')!
  const entry = { date: session.date, sessionType: session.type, status: 'Done', distanceKm: 10, duration: '01:00:00', distanceUnreported: false, isAdditional: false } as CheckIn
  const extra = { ...entry, isAdditional: true, distanceKm: 3 }
  const timed = { ...entry, isAdditional: true, distanceKm: null, distanceUnreported: true }
  const today = '2026-10-18'
  expect(ranKmByWeek([week], [], today, [entry, extra, timed]).get(week.number)).toBe(13)
  const recording = { id: 'one', localDate: entry.date, distanceKm: 10 } as ActivitySummary
  expect(ranKmByWeek([week], [recording], today, [entry, extra, timed]).get(week.number)).toBe(13)
  expect(ranKmByWeek([week], [recording], today, [{ ...entry, activityId: 'one', distanceKm: null, distanceUnreported: true }]).get(week.number)).toBe(10)
})
