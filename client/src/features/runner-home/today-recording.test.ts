import { describe, expect, it } from 'vitest'
import type { ActivitySummary, CheckIn, Session, SyncedCompletion } from '../../lib/types'
import type { SessionCoach } from '../coaching/useCheckIns'
import { recordingForToday } from './today-recording'
const session = { date: '2026-10-20', type: 'Fartlek' } as Session
const recording = (id: string, kind: 'Upload' | 'Strava' = 'Upload') => ({ id, localDate: session.date, kind: 'Run', plannedSessionType: session.type, source: { kind, cachedUntil: '2026-10-21T00:00:00Z' } }) as ActivitySummary
const coach = (own?: Partial<CheckIn>, importedId?: string, entries: Partial<CheckIn>[] = []) => ({ get: () => own, entries, synced: () => importedId ? { state: 'Completed', activityId: importedId } as SyncedCompletion : undefined }) as unknown as SessionCoach
const now = Date.parse('2026-10-20T12:00:00Z')
describe('today’s recording identity', () => {
  it('uses a unique uploaded recording matched to the prescribed session', () => expect(recordingForToday(session, coach(), [recording('a')], now)?.id).toBe('a'))
  it('requires a choice for multiple uploaded recordings', () => expect(recordingForToday(session, coach(), [recording('a'), recording('b')], now)).toBeNull())
  it('does not infer a match from the calendar date alone', () => expect(recordingForToday(session, coach(), [{ ...recording('a'), plannedSessionType: null }], now)).toBeNull())
  it('uses the saved explicit association before other candidates', () => expect(recordingForToday(session, coach({ activityId: 'b', status: 'Done' }), [recording('a'), recording('b')], now)?.id).toBe('b'))
  it('never substitutes another recording for a missing explicit association', () => expect(recordingForToday(session, coach({ activityId: 'missing', status: 'Done' }), [recording('a')], now)).toBeNull())
  it('uses a server-confirmed Strava association without saving a check-in', () => expect(recordingForToday(session, coach(undefined, 'a'), [recording('a', 'Strava')], now)?.id).toBe('a'))
  it('does not match an unassociated Strava run', () => expect(recordingForToday(session, coach(), [recording('a', 'Strava')], now)).toBeNull())
  it('retains the runner’s skip over a provider match', () => expect(recordingForToday(session, coach({ status: 'Skipped' }, 'a'), [recording('a', 'Strava')], now)).toBeNull())
  it('does not attach a recording to a manually confirmed run without an explicit link', () => expect(recordingForToday(session, coach({ status: 'Done', distanceKm: 6 }), [recording('a')], now)).toBeNull())
  it('does not present an expired Strava recording as current', () => expect(recordingForToday(session, coach(undefined, 'a'), [recording('a', 'Strava')], Date.parse('2026-10-22T00:00:00Z'))).toBeNull())
  it('excludes additional runs from prescribed-session matching', () => expect(recordingForToday(session, coach(undefined, undefined, [{ isAdditional: true, activityId: 'a' }]), [recording('a')], now)).toBeNull())
  it('excludes non-running recordings', () => expect(recordingForToday(session, coach(), [{ ...recording('a'), kind: 'Other' }], now)).toBeNull())
})
