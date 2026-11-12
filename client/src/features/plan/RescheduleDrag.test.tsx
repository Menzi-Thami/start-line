import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import type { LifeChange, LifeProposal } from '../../lib/types'
import { LifeHappens } from './LifeHappens'

describe('reschedule from calendar drag', () => {
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

  it('does not submit a move when the server rejects the target', async () => {
    const from = planFixture.weeks[0]!.sessions.find(s => s.type !== 'Strength')!.date
    const preview = vi.fn(async () => { throw new Error('No safe day available') })
    const apply = vi.fn(async () => {})
    render(<LifeHappens plan={planFixture} today={from} units="km" moveDate={from} moveTarget="2030-01-01" actions={{ preview, apply, restore: async () => {} }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No safe day available')
    expect(apply).not.toHaveBeenCalled()
  })
})
