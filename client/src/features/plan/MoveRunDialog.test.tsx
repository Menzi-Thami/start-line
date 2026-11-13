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

  it('turns a drop onto another run into a swap, and nothing is saved until it is confirmed', async () => {
    const runs = planFixture.weeks.flatMap(w => w.sessions).filter(s => s.type !== 'Race' && s.type !== 'Strength')
    const [first, second] = [runs[0]!, runs.find(s => s.date !== runs[0]!.date)!]
    const swapped = [
      { appliedOn: first.date, date: first.date, originalType: first.type, originalTitle: first.title, originalKm: first.distanceKm, easyKm: null },
      { appliedOn: first.date, date: second.date, originalType: second.type, originalTitle: second.title, originalKm: second.distanceKm, easyKm: null },
      { appliedOn: first.date, date: second.date, movedFrom: first.date, originalType: first.type, originalTitle: first.title, originalKm: first.distanceKm, easyKm: first.distanceKm },
      { appliedOn: first.date, date: first.date, movedFrom: second.date, originalType: second.type, originalTitle: second.title, originalKm: second.distanceKm, easyKm: second.distanceKm },
    ] as LifeProposal['changes']
    const preview = vi.fn(async (_change: LifeChange) => proposed(swapped))
    const apply = vi.fn(async () => {})
    const restore = vi.fn(async () => {})
    render(<MoveRunDialog from={first.date} to={second.date} plan={planFixture} units="km" actions={{ preview, apply, restore }} onClose={() => {}} />)
    expect(await screen.findByRole('dialog', { name: 'Swap these runs?' })).toBeVisible()
    expect(preview).toHaveBeenCalledWith({ situation: 'SwapRuns', date: first.date, moveTo: second.date, canRun: true })
    expect(screen.getByText('Both workouts stay the same. They trade days.')).toBeVisible()
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Swap runs' }))
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ situation: 'SwapRuns', date: first.date, moveTo: second.date, canRun: true }, 'A'.repeat(64)))
    expect(await screen.findByRole('heading', { name: 'Runs swapped' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith([first.date, second.date]))
  })

  it('offers runs to swap with next to free days when a drop is not allowed', async () => {
    const preview = vi.fn(async (change: LifeChange) => {
      if (change.moveTo) throw new Error('Choose one of the days offered.')
      return change.situation === 'SwapRuns' ? proposed([], [target]) : proposed([], [])
    })
    render(<MoveRunDialog from={from} to={target} plan={planFixture} units="km" actions={{ preview, apply: async () => {}, restore: async () => {} }} onClose={() => {}} />)
    const swaps = await screen.findByRole('group', { name: 'Runs to swap with' })
    expect(screen.queryByRole('group', { name: 'Available dates' })).not.toBeInTheDocument()
    fireEvent.click(swaps.querySelector('button')!)
    await waitFor(() => expect(preview).toHaveBeenCalledWith({ situation: 'SwapRuns', date: from, moveTo: target, canRun: true }))
  })
})
