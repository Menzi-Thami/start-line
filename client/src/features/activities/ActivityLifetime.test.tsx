import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Activity } from '../../lib/types'
import fixture from '../../test/fixtures/activity-long-run.json'
import { ActivityPage } from './ActivityPage'

it('never displays expired Strava evidence while the expiry effect catches up', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
    const activity = { ...fixture, source: { kind: 'Strava', cachedUntil: '2026-11-04T11:00:00Z', viewUrl: null, recordedOnGarmin: false } } as Activity
    render(<ActivityPage id={activity.id} initial={activity} units="km" onBack={() => {}} onDeleted={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('expired')
    expect(screen.queryByRole('heading', { name: 'Long run' })).not.toBeInTheDocument()
  } finally { vi.useRealTimers() }
})

it.each([null, 'invalid'])('withholds stage observations without a valid source lifetime (%s)', cachedUntil => {
  const activity = { ...fixture, source: { kind: 'Strava', cachedUntil, viewUrl: null, recordedOnGarmin: false }, workoutExecution: { stages: [{ number: 1, kind: 'Run', coverage: 1, recordedMetres: 1000, movingSeconds: 300, elapsedSeconds: 300 }] } } as Activity
  render(<ActivityPage id={activity.id} initial={activity} units="km" onBack={() => {}} onDeleted={() => {}} />)
  expect(screen.queryByRole('region', { name: 'Workout stage evidence' })).not.toBeInTheDocument()
  expect(screen.queryByText(/There is useful evidence in this recording/)).not.toBeInTheDocument()
})
