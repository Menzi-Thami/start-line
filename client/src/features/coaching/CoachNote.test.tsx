import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CoachNote as Note } from '../../lib/types'
import { CoachNote } from './CoachNote'

const note = (overrides: Partial<Note>): Note => ({
  weekStart: '2026-10-19',
  verdict: 'OnTrack',
  holdVolume: false,
  doseStep: 0,
  cutbackNow: false,
  reasons: ['RanAsPlanned'],
  ...overrides,
})

describe('the coach’s note', () => {
  it('says what it saw and what it changed after a hard week', () => {
    render(<CoachNote note={note({ verdict: 'Struggling', holdVolume: true, doseStep: -1, reasons: ['FeltHarderThanPlanned', 'MissedVolume'] })} />)

    expect(screen.getByRole('heading', { name: 'An easier week' })).toBeInTheDocument()
    expect(screen.getByText('Several runs last week felt harder than they should.')).toBeInTheDocument()
    expect(screen.getByText('Last week came in well short of the plan.')).toBeInTheDocument()
    expect(screen.getByText('This week stays at last week’s distance, with one smaller hard session instead of two.')).toBeInTheDocument()
  })

  it('brings the easier week forward after two hard ones', () => {
    render(<CoachNote note={note({ verdict: 'Struggling', holdVolume: true, doseStep: -1, cutbackNow: true, reasons: ['Niggles', 'StrugglingTwice'] })} />)

    expect(screen.getByText('This is an easier week: less running and no hard sessions.')).toBeInTheDocument()
  })

  it('offers the injury replan for pain, and only offers it', async () => {
    const onInjuryReplan = vi.fn().mockResolvedValue(undefined)
    render(<CoachNote note={note({ verdict: 'Hurting', holdVolume: true, doseStep: -1, reasons: ['Pain'] })} onInjuryReplan={onInjuryReplan} />)

    expect(onInjuryReplan).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rebuild my plan after an injury' }))

    expect(onInjuryReplan).toHaveBeenCalledOnce()
  })

  it('says when a replan after pain didn’t work', async () => {
    const onInjuryReplan = vi.fn().mockRejectedValue(new Error('Your race is too close to rebuild the plan.'))
    render(<CoachNote note={note({ verdict: 'Hurting', reasons: ['Pain'] })} onInjuryReplan={onInjuryReplan} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Rebuild my plan after an injury' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('too close')
  })

  it('cheers a strong week, and steps up after two', () => {
    const { rerender } = render(<CoachNote note={note({ verdict: 'Thriving', reasons: ['FeltEasierThanPlanned'] })} />)
    expect(screen.getByText('Keep it up: another week like that and the hard sessions step up.')).toBeInTheDocument()

    rerender(<CoachNote note={note({ verdict: 'Thriving', doseStep: 1, reasons: ['FeltEasierThanPlanned', 'ThrivingTwice'] })} />)
    expect(screen.getByText('This week’s hard sessions are a step bigger.')).toBeInTheDocument()
  })

  it('asks for check-ins when it has nothing to go on', () => {
    render(<CoachNote note={note({ verdict: 'NotEnoughToGoOn', reasons: ['FewCheckIns'] })} />)

    expect(screen.getByRole('heading', { name: 'Tell me how your runs go' })).toBeInTheDocument()
  })
})
