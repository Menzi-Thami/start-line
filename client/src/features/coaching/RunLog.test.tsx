import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { RunLog } from './RunLog'

it('logs time on a rest day as an additional entry without completing a prescribed session', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const saveAdditional = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<RunLog plan={planFixture} coach={{ today: '2026-10-14', units: 'km', get: () => undefined, save, remove: vi.fn(), saveAdditional, removeAdditional: vi.fn(), entries: [] }} />)
  await user.click(screen.getByRole('button', { name: 'Log a run' }))
  await user.type(screen.getByLabelText('Minutes'), '42')
  await user.click(screen.getByRole('button', { name: 'Save check-in' }))
  expect(saveAdditional).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ date: '2026-10-14', title: 'Additional run' }), expect.objectContaining({ duration: '00:42:00', distanceKm: null, distanceUnreported: true }))
  expect(saveAdditional.mock.calls[0]![0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(save).not.toHaveBeenCalled()
})

it('can save an independently reported distance from the synced-run confirmation flow', async () => {
  const saveAdditional = vi.fn().mockResolvedValue(undefined)
  const activity = { id: 'synced-run', localDate: '2026-10-14', distanceKm: 10, movingSeconds: 3600, source: { kind: 'Strava' } } as import('../../lib/types').ActivitySummary
  const user = userEvent.setup()
  render(<RunLog plan={planFixture} initialRun={activity} runs={[activity]} coach={{ today: '2026-10-15', units: 'km', get: () => undefined, save: vi.fn(), remove: vi.fn(), saveAdditional, removeAdditional: vi.fn(), entries: [] }} />)
  expect(screen.getByLabelText('Run details')).toHaveValue('synced-run')
  await user.selectOptions(screen.getByLabelText('Run details'), '')
  await user.type(screen.getByLabelText('Distance (km)'), '10')
  await user.click(screen.getByRole('button', { name: 'Save check-in' }))
  expect(saveAdditional).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ date: '2026-10-14' }), expect.objectContaining({ distanceKm: 10, distanceUnreported: false, activityId: 'synced-run', independentMetrics: true }))
})
