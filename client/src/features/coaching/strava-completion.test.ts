import { describe, expect, it } from 'vitest'
import type { CheckIn, PlanWeek, Session, SyncedCompletion } from '../../lib/types'
import { completedViaStrava, syncedFor } from './strava-completion'
import type { SessionCoach } from './useCheckIns'
import { reviewWeek } from './week-review'

const session = { date: '2026-10-20', type: 'Fartlek', title: 'Fartlek', distanceKm: 6.5 } as Session
const completion = { date: '2026-10-20', sessionType: 'Fartlek', state: 'Completed' } as SyncedCompletion

const coach = (entry?: Partial<CheckIn>, synced: SyncedCompletion | undefined = completion): SessionCoach => ({
  today: '2026-10-21',
  units: 'km',
  get: () => (entry ? ({ date: session.date, sessionType: session.type, ...entry } as CheckIn) : undefined),
  synced: () => synced,
  save: async () => {},
  remove: async () => {},
})

describe('the runner’s word against a Strava completion', () => {
  it('shows completed via Strava only while the runner hasn’t answered', () => {
    expect(syncedFor(session, coach())?.state).toBe('Completed')
    expect(completedViaStrava(session, coach())).toBe(true)
  })

  it('lets the runner’s own tick win, even before the API has caught up', () => {
    expect(syncedFor(session, coach({ status: 'Done' }))).toBeUndefined()
    expect(syncedFor(session, coach({ status: 'CutShort' }))).toBeUndefined()
  })

  it('turns a skip into a conflict, and a removed skip back into a completion, without waiting for the API', () => {
    expect(syncedFor(session, coach({ status: 'Skipped' }))?.state).toBe('Conflict')
    expect(completedViaStrava(session, coach({ status: 'Skipped' }))).toBe(false)
    expect(syncedFor(session, coach(undefined, { ...completion, state: 'Conflict' }))?.state).toBe('Completed')
  })

  it('completes nothing without a completion or a coach', () => {
    expect(syncedFor(session, { ...coach(), synced: () => undefined })).toBeUndefined()
    expect(completedViaStrava(session, undefined)).toBe(false)
  })

  it('counts a Strava completion in the week review once, beside the runner’s own answers', () => {
    const week = { number: 2, startDate: '2026-10-19', sessions: [session, { ...session, date: '2026-10-22', type: 'Easy' }] } as unknown as PlanWeek
    const review = reviewWeek(week, [], '2026-10-26', () => undefined, [], (s) => s.date === '2026-10-20')
    expect(review).toMatchObject({ dueRuns: 2, doneRuns: 1 })
  })
})
