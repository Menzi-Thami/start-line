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
