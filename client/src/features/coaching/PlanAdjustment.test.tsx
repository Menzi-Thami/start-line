import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { CoachingProposal } from '../../lib/types'
import { planFixture } from '../../test/server'
import { PlanAdjustment } from './PlanAdjustment'

const proposal = { token: 'A'.repeat(64), hasChanges: true, canApply: true, proposed: { plan: planFixture, coaching: [] } } as unknown as CoachingProposal
it('previews only on request and applies only after the runner reviews it', async () => {
  const actions = { review: vi.fn().mockResolvedValue(proposal), apply: vi.fn().mockResolvedValue(undefined) }
  const user = userEvent.setup()
  render(<PlanAdjustment current={planFixture} units="km" actions={actions} />)
  expect(actions.review).not.toHaveBeenCalled()
  expect(actions.apply).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Review training adjustments' }))
  expect(await screen.findByText('This is a preview. Your plan has not changed.')).toBeVisible()
  expect(actions.apply).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Apply this adjustment' }))
  expect(actions.apply).toHaveBeenCalledExactlyOnceWith(proposal.token, 'NotReported')
})
it('requires a fresh review after a stale proposal is rejected', async () => {
  const actions = { review: vi.fn().mockResolvedValue(proposal), apply: vi.fn().mockRejectedValue(new Error('Review the latest suggestion.')) }
  const user = userEvent.setup()
  render(<PlanAdjustment current={planFixture} units="km" actions={actions} />)
  await user.click(screen.getByRole('button', { name: 'Review training adjustments' }))
  await user.click(await screen.findByRole('button', { name: 'Apply this adjustment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Review the latest suggestion.')
  expect(screen.queryByRole('button', { name: 'Apply this adjustment' })).toBeNull()
})

it('shows changed pace targets before allowing the adjustment to be applied', async () => {
  const changed = { ...proposal, proposed: { ...proposal.proposed, plan: { ...planFixture, paces: planFixture.paces.map((p) => p.zone === 'Easy' ? { ...p, fastestSecondsPerKm: p.fastestSecondsPerKm + 10, slowestSecondsPerKm: p.slowestSecondsPerKm + 10 } : p) } } }
  const actions = { review: vi.fn().mockResolvedValue(changed), apply: vi.fn() }
  const user = userEvent.setup()
  render(<PlanAdjustment current={planFixture} units="km" actions={actions} />)
  await user.click(screen.getByRole('button', { name: 'Review training adjustments' }))
  expect(await screen.findByText('Pace changes')).toBeVisible()
  expect(screen.getByText(/Easy pace:/)).toHaveTextContent('→')
  expect(actions.apply).not.toHaveBeenCalled()
})

it('invalidates the weekly preview when the recovery answer changes', async () => {
  const actions = { review: vi.fn().mockResolvedValue(proposal), apply: vi.fn() }
  const user = userEvent.setup()
  render(<PlanAdjustment current={planFixture} units="km" actions={actions} />)
  await user.selectOptions(screen.getByLabelText('How recovered do you feel for the week ahead?'), 'Tired')
  await user.click(screen.getByRole('button', { name: 'Review training adjustments' }))
  expect(actions.review).toHaveBeenCalledExactlyOnceWith('Tired')
  expect(await screen.findByRole('button', { name: 'Apply this adjustment' })).toBeVisible()
  await user.selectOptions(screen.getByLabelText('How recovered do you feel for the week ahead?'), 'Ready')
  expect(screen.queryByRole('button', { name: 'Apply this adjustment' })).toBeNull()
  expect(actions.apply).not.toHaveBeenCalled()
})
