import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LifeProposal, SessionRevision, TrainingPlan } from '../../lib/types'
import { planFixture } from '../../test/server'
import { ChangePlan } from './ChangePlan'

// Thursday of week 2: Tuesday's fartlek is behind, the weekend's runs are ahead.
const today = '2026-10-22'
const fartlek: SessionRevision = { appliedOn: today, date: '2026-10-20', originalType: 'Fartlek', originalTitle: 'Fartlek', originalKm: 6.5, easyKm: null }
const movedFartlek: SessionRevision = { ...fartlek, date: '2026-10-24', easyKm: 6.5, movedFrom: '2026-10-20' }
const proposal = (changes: SessionRevision[], moveTargets: string[] = []) => ({ token: 'T'.repeat(64), changes, moveTargets, proposed: planFixture }) as unknown as LifeProposal

function setup(plan: TrainingPlan = planFixture) {
  const life = {
    preview: vi.fn(async (change: { moveTo?: string | null }) => (change.moveTo ? proposal([fartlek, movedFartlek]) : proposal([], ['2026-10-23', '2026-10-24']))),
    apply: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
  }
  render(<ChangePlan plan={plan} today={today} units="km" life={life} />)
  return life
}

const open = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByText('Change my plan', { selector: 'summary' }))

describe('Change my plan: day-to-day changes', () => {
  it('moves a missed key session to a day it offers, applies only after a preview, and can undo it', async () => {
    const life = setup()
    const user = userEvent.setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Missed a run' }))
    expect(screen.getByLabelText('Which run?')).toHaveValue('2026-10-20')
    await user.click(screen.getByRole('button', { name: 'Show what changes' }))
    const days = within(await screen.findByRole('group', { name: 'Move to' }))
    await user.click(days.getAllByRole('button')[1]!)

    expect(await screen.findByText(/Fartlek moves from .* to /)).toBeVisible()
    expect(screen.getByText('This is a preview. Your plan hasn’t changed.')).toBeVisible()
    expect(life.apply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))
    expect(life.apply).toHaveBeenCalledExactlyOnceWith({ situation: 'MissedRun', date: '2026-10-20', moveTo: '2026-10-24', canRun: true }, 'T'.repeat(64))
    expect(await screen.findByRole('status')).toHaveTextContent('Plan updated.')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(life.restore).toHaveBeenCalledExactlyOnceWith(['2026-10-20', '2026-10-24'])
    expect(await screen.findByRole('status')).toHaveTextContent('Back as your plan first wrote it.')
  })

  it('rests for the days the runner is unwell, through the same door', async () => {
    const life = setup()
    life.preview.mockResolvedValueOnce(proposal([{ ...fartlek, date: '2026-10-22', originalType: 'ProgressionRun', originalTitle: 'Progression run', originalKm: 7.5 }]))
    const user = userEvent.setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Feeling unwell' }))
    await user.selectOptions(screen.getByLabelText('Days to rest, from today'), '3')
    await user.click(screen.getByRole('button', { name: 'Show what changes' }))
    expect(await screen.findByText(/Progression run 7.5 km → rest/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Apply these changes' }))
    expect(life.apply).toHaveBeenCalledExactlyOnceWith({ situation: 'Unwell', days: 3, canRun: true }, 'T'.repeat(64))
  })

  it('lists changed days ahead with a restore for each', async () => {
    const user = userEvent.setup()
    const life = setup({ ...planFixture, adjustments: [{ appliedOn: today, date: '2026-10-24', originalType: 'Intervals', originalTitle: 'Intervals', originalKm: 9, easyKm: 5 }] })
    await open(user)
    expect(screen.getByText(/Intervals 9 km → easy 5 km/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^Restore / }))
    expect(life.restore).toHaveBeenCalledExactlyOnceWith(['2026-10-24'])
  })

  it('says a changed run that keeps its type stays that run, not an easy one', async () => {
    const user = userEvent.setup()
    const longer: SessionRevision = { appliedOn: today, date: '2026-10-25', originalType: 'LongRun', originalTitle: 'Long run', originalKm: 6.5, easyKm: 7.5, type: 'LongRun' }
    setup({ ...planFixture, adjustments: [longer] })
    await open(user)
    expect(screen.getByText(/Long run 6.5 km → Long run 7.5 km/)).toBeVisible()
  })

  it('offers one list of choices, and sends a single move to the run’s own day', async () => {
    const user = userEvent.setup()
    render(<ChangePlan plan={planFixture} today={today} units="km" life={{ preview: vi.fn(), apply: vi.fn(), restore: vi.fn() }} week={{ reviewRemaining: vi.fn(), applyRemaining: vi.fn() }} onReplan={vi.fn()} />)
    await open(user)
    const choices = within(screen.getByRole('group', { name: 'What happened?' })).getAllByRole('button').map(button => button.textContent)
    expect(choices).toEqual(['Missed a run', 'Short on time', 'Travelling', 'Feeling unwell', 'Week off track', 'Rebuild from today'])
    expect(screen.getByText('To move a run, open its day.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Week off track' }))
    expect(screen.getByRole('heading', { name: 'Ease the rest of this week' })).toBeVisible()
  })

  it('offers only a rebuild on a plan that isn’t saved', async () => {
    const user = userEvent.setup()
    render(<ChangePlan plan={planFixture} today={today} units="km" onReplan={vi.fn()} />)
    await open(user)
    expect(within(screen.getByRole('group', { name: 'What happened?' })).getAllByRole('button').map(button => button.textContent)).toEqual(['Rebuild from today'])
    expect(screen.getByText('Save this plan to change single days.')).toBeInTheDocument()
  })
})
