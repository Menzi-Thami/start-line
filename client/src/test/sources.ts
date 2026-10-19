import type { RunSource } from '../lib/types'

/** Where a test run came from: a .fit upload, unless a test says otherwise. */
export const UPLOADED: RunSource = { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null }

export const FROM_STRAVA: RunSource = {
  kind: 'Strava',
  viewUrl: 'https://www.strava.com/activities/1234',
  recordedOnGarmin: true,
  cachedUntil: '2026-10-25T06:00:00Z',
}
