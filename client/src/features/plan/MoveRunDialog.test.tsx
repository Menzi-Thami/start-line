import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LifeChange, LifeProposal } from '../../lib/types'
import { planFixture } from '../../test/server'
import { MoveRunDialog } from './MoveRunDialog'

const from = planFixture.weeks.flatMap(w => w.sessions).find(s => s.type !== 'Race' && s.type !== 'Strength')!.date
const target = new Date(Date.parse(from + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
const proposed = (changes: LifeProposal['changes'], targets: string[] = []) =>
  ({ token: 'A'.repeat(64), changes, moveTargets: targets, proposed: planFixture }) as LifeProposal
const moved = [{
  appliedOn: from, date: target, movedFrom: from, originalType: 'Easy', originalTitle: 'Easy run',
  originalKm: 4.5, easyKm: 4.5,
}] as LifeProposal['changes']

describe('Move Run confirmation dialog', () => {
  it('previews a drop, then requires explicit confirmation before saving', async () => {
    const preview = vi.fn(async (_change: LifeChange) => proposed(moved))
    const apply = vi.fn(async () => {})
    const restore = vi.fn(async () => {})
    render(<MoveRunDialog from={from} to={target} plan={planFixture} units="km" actions={{ preview, apply, restore }} onClose={() => {}} />)
    expect(await screen.findByRole('dialog', { name: 'Move this run?' })).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Move run' })).toBeEnabled()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Move run' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ situation: 'MoveRun', date: from, moveTo: target, canRun: true }, 'A'.repeat(64)))
    expect(await screen.findByText('Saved! Your training calendar has been updated.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith([target]))
  })

  it('offers eligible days in the same pop-up when a drop is invalid', async () => {
    const preview = vi.fn(async (change: LifeChange) => {
      if (change.moveTo) throw new Error('Choose one of the days offered.')
      return proposed([], [target])
    })
    const apply = vi.fn(async () => {})
    render(<MoveRunDialog from={from} to={target} plan={planFixture} units="km" actions={{ preview, apply, restore: async () => {} }} onClose={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('is not available')
    expect(await screen.findByRole('group', { name: 'Available dates' })).toBeVisible()
    expect(apply).not.toHaveBeenCalled()
  })
})
