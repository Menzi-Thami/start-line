import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import type { LifeChange, LifeProposal } from '../../lib/types'
import { LifeHappens } from './LifeHappens'
import { WeekGlance } from './WeekGlance'

describe('reschedule from calendar drag', () => {
  it('routes a drop on another date to Move Run without changing the plan', () => {
    const week = planFixture.weeks.find(w => w.sessions.some(s => s.type !== 'Strength' && s.type !== 'Race'))!
    const from = week.sessions.find(s => s.type !== 'Strength' && s.type !== 'Race')!.date
    const target = from === week.startDate ? new Date(Date.parse(from + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10) : week.startDate
    const requestMove = vi.fn()
    const transfer = { setData: vi.fn(), getData: vi.fn(() => from), effectAllowed: 'move' }
    const { container } = render(<WeekGlance week={week} today={week.startDate} units="km" done={new Set()} onSelectDate={() => {}} onRequestMove={requestMove} />)
    const origin = container.querySelector<HTMLButtonElement>(`[data-date="${from}"]`)!
    const destination = container.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)!
    expect(origin.draggable).toBe(true)
    fireEvent.dragStart(origin, { dataTransfer: transfer })
    fireEvent.dragOver(destination, { dataTransfer: transfer })
    fireEvent.drop(destination, { dataTransfer: transfer })
    expect(requestMove).toHaveBeenCalledWith(from, target)
    expect(origin).toBeInTheDocument()
  })

  it('previews the dropped target without saving before confirmation', async () => {
    const from = planFixture.weeks.flatMap(w => w.sessions).find(s => s.type !== 'Strength' && s.type !== 'Race')!.date
    const target = new Date(Date.parse(from + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10)
    const proposal = { token: 't'.repeat(64), changes: [{
      appliedOn: from, date: target, movedFrom: from, originalTitle: 'Easy run', originalType: 'Easy',
      originalKm: 4.5, easyKm: 4.5,
    }], moveTargets: [], proposed: planFixture } as unknown as LifeProposal
    const preview = vi.fn(async (_change: LifeChange) => proposal)
    const apply = vi.fn(async () => {})
    render(<LifeHappens plan={planFixture} today={from} units="km" moveDate={from} moveTarget={target} actions={{ preview, apply, restore: async () => {} }} />)
    await waitFor(() => expect(preview).toHaveBeenCalledWith({ situation: 'MoveRun', date: from, moveTo: target, canRun: true }))
    expect(apply).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Apply these changes' })).toBeVisible()
    expect(apply).not.toHaveBeenCalled()
  })

  it('offers server-approved days when a drop targets an occupied day', async () => {
    const from = planFixture.weeks[0]!.sessions.find(s => s.type !== 'Strength')!.date
    const occupied = '2026-10-18'
    const free = '2026-10-19'
    const empty = { token: 't'.repeat(64), changes: [], moveTargets: [free], proposed: planFixture } as unknown as LifeProposal
    const preview = vi.fn(async (change: LifeChange) => {
      if (change.moveTo === occupied) throw new Error('Choose one of the days offered.')
      if (!change.moveTo) return empty
      return { ...empty, changes: [{ appliedOn: from, date: free, movedFrom: from, originalTitle: 'Easy run', originalType: 'Easy', originalKm: 4.5, easyKm: 4.5 }] }
    })
    const apply = vi.fn(async () => {})
    render(<LifeHappens plan={planFixture} today={from} units="km" moveDate={from} moveTarget={occupied} actions={{ preview, apply, restore: async () => {} }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't an available destination")
    expect(await screen.findByRole('group', { name: 'Move to' })).toBeVisible()
    expect(screen.getByRole('button', { name: /19 Oct/ })).toBeVisible()
    expect(apply).not.toHaveBeenCalled()
  })

  it('does not submit a move when the server rejects the target', async () => {
    const from = planFixture.weeks[0]!.sessions.find(s => s.type !== 'Strength')!.date
    const preview = vi.fn(async () => { throw new Error('No safe day available') })
    const apply = vi.fn(async () => {})
    render(<LifeHappens plan={planFixture} today={from} units="km" moveDate={from} moveTarget="2030-01-01" actions={{ preview, apply, restore: async () => {} }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No safe day available')
    expect(apply).not.toHaveBeenCalled()
  })
})
