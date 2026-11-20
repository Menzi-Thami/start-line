import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AiCoachAnswer } from '../../lib/api-client'
import type { LifeChange, LifeProposal } from '../../lib/types'
import { AiCoachPanel } from './AiCoachPanel'

const change = { situation: 'ShortOnTime', date: '2026-11-23', minutes: 30 } as LifeChange
const proposal = {
  token: 'review-token',
  changes: [{ date: '2026-11-23', originalKm: 7, easyKm: 4.5 }],
  moveTargets: [],
} as unknown as LifeProposal

describe('Taperday AI coach pilot', () => {
  it('does not call the model until the runner asks or change the plan without confirmation', async () => {
    const ask = vi.fn(async (): Promise<AiCoachAnswer> => ({ reply: 'Run 30 minutes at easy effort.', change, proposal }))
    const apply = vi.fn(async () => {})
    const user = userEvent.setup()
    render(<AiCoachPanel ask={ask} apply={apply} />)
    expect(ask).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Ask the Taperday coach' }))
    await user.type(screen.getByRole('textbox', { name: 'What would you like help with?' }), 'Can I run only 30 minutes?')
    await user.click(screen.getByRole('button', { name: 'Ask coach' }))
    expect(await screen.findByText('Run 30 minutes at easy effort.')).toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
    expect(screen.getByText(/4.50 km easy/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply this adjustment' }))
    expect(apply).toHaveBeenCalledWith(change, 'review-token')
    expect(await screen.findByText(/Your plan has been updated/)).toBeInTheDocument()
  })

  it('allows keeping the original plan', async () => {
    const ask = vi.fn(async (): Promise<AiCoachAnswer> => ({ reply: 'Here is a shorter option.', change, proposal }))
    const apply = vi.fn(async () => {})
    const user = userEvent.setup()
    render(<AiCoachPanel ask={ask} apply={apply} />)
    await user.click(screen.getByRole('button', { name: 'Ask the Taperday coach' }))
    await user.type(screen.getByRole('textbox'), 'Can I shorten my run?')
    await user.click(screen.getByRole('button', { name: 'Ask coach' }))
    await screen.findByText('Here is a shorter option.')
    await user.click(screen.getByRole('button', { name: 'Keep my original plan' }))
    expect(screen.queryByText('Here is a shorter option.')).not.toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it('shows advice without a write action when a change is not safe', async () => {
    const ask = vi.fn(async (): Promise<AiCoachAnswer> => ({ reply: 'Keep the planned recovery day.', change: null, proposal: null }))
    const user = userEvent.setup()
    render(<AiCoachPanel ask={ask} apply={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Ask the Taperday coach' }))
    await user.type(screen.getByRole('textbox'), 'Should I run harder?')
    await user.click(screen.getByRole('button', { name: 'Ask coach' }))
    expect(await screen.findByText('Keep the planned recovery day.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply this adjustment' })).not.toBeInTheDocument()
  })
})
