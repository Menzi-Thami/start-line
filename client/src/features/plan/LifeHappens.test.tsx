import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LifeProposal, SessionRevision, TrainingPlan } from '../../lib/types'
import { planFixture } from '../../test/server'
import { LifeHappens } from './LifeHappens'

const today = planFixture.weeks[1]!.startDate
const longRun = (d: number) => new Date(Date.parse(`${today}T12:00:00Z`) + d * 86400000).toISOString().slice(0, 10)
const rest: SessionRevision = { appliedOn: today, date: longRun(6), originalType: 'LongRun', originalTitle: 'Long run', originalKm: 14, easyKm: null }
const moved: SessionRevision = { ...rest, date: longRun(5), easyKm: 14, movedFrom: longRun(6) }
const proposal = (changes: SessionRevision[], moveTargets: string[] = []) => ({ token: 'T'.repeat(64), changes, moveTargets, proposed: planFixture }) as unknown as LifeProposal

function setup(plan: TrainingPlan = planFixture) {
  const actions = {
    preview: vi.fn(async (change: { moveTo?: string | null }) => (change.moveTo ? proposal([rest, moved], [longRun(4), longRun(5)]) : proposal([], [longRun(4), longRun(5)]))),
    apply: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
  }
  render(<LifeHappens plan={plan} today={today} units="km" actions={actions} />)
  return actions
}

describe('Life happens', () => {
  it('moves the long run to a day it offers, applies only after a preview, and can undo it', async () => {
    const actions = setup()
    const user = userEvent.setup()
    await user.click(screen.getByText('Life happens · change of plans?'))
    await user.click(screen.getByRole('button', { name: 'Move my long run' }))
    await user.click(screen.getByRole('button', { name: 'Show what changes' }))
    const days = within(await screen.findByRole('group', { name: 'Move to' }))
    await user.click(days.getAllByRole('button')[1]!)

    expect(await screen.findByText(/Long run moves from .* to /)).toBeVisible()
    expect(screen.getByText('This is a preview. Your plan hasn’t changed.')).toBeVisible()
    expect(actions.apply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))
    expect(actions.apply).toHaveBeenCalledExactlyOnceWith({ situation: 'MoveLongRun', moveTo: longRun(5), canRun: true }, 'T'.repeat(64))
    expect(await screen.findByRole('status')).toHaveTextContent('Plan updated.')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(actions.restore).toHaveBeenCalledExactlyOnceWith([longRun(6), longRun(5)])
    expect(await screen.findByRole('status')).toHaveTextContent('Back as your plan first wrote it.')
  })

  it('lists changed days ahead with a restore for each, and needs a saved plan to change anything', async () => {
    const user = userEvent.setup()
    const actions = setup({ ...planFixture, adjustments: [{ appliedOn: today, date: longRun(1), originalType: 'Intervals', originalTitle: 'Intervals', originalKm: 9, easyKm: 5 }] })
    await user.click(screen.getByText('Life happens · change of plans?'))
    expect(screen.getByText(/Intervals 9 km → easy 5 km/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^Restore / }))
    expect(actions.restore).toHaveBeenCalledExactlyOnceWith([longRun(1)])
  })

  it('offers nothing to change on a plan that isn’t saved', () => {
    render(<LifeHappens plan={planFixture} today={today} units="km" />)
    expect(screen.getByText(/Save this plan to move, shorten or rest sessions/)).toBeInTheDocument()
  })
})
