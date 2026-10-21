import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CoachNote as Note } from '../../lib/types'
import { CoachNote } from './CoachNote'
import { PacesIntro, PredictedTimes } from './FitnessNotes'

// A 52-minute 10K goal.
const GOAL = 52 * 60

const note = (weekStart: string, overrides: Partial<Note> = {}): Note => ({
  weekStart,
  verdict: 'OnTrack',
  holdVolume: false,
  doseStep: 0,
  cutbackNow: false,
  reasons: ['RanAsPlanned'],
  fitness: null,
  paceFactor: 1,
  ...overrides,
})

describe('paces that follow fitness', () => {
  it('say the paces follow today’s fitness when it’s slower than the goal', () => {
    render(<PacesIntro notes={[note('2026-10-19', { fitness: '00:58:30' })]} goalSeconds={GOAL} />)

    expect(screen.getByText(/point to about/)).toHaveTextContent('58:30 for this race, so your training paces follow that fitness today')
    expect(screen.getByText(/point to about/)).toHaveTextContent('Race-pace runs stay at your goal of 52:00')
  })

  it('keep the goal’s paces when fitness is ahead of it', () => {
    render(<PacesIntro notes={[note('2026-10-19', { fitness: '00:50:10' })]} goalSeconds={GOAL} />)

    expect(screen.getByText(/ahead of your goal/)).toBeInTheDocument()
  })

  it('say how much easier the paces are when hard sessions have felt very hard', () => {
    render(<PacesIntro notes={[note('2026-10-19', { paceFactor: 1.02 })]} goalSeconds={GOAL} />)

    expect(screen.getByText(/2% easier for now/)).toBeInTheDocument()
  })

  it('use the latest call that said anything about paces', () => {
    render(<PacesIntro notes={[note('2026-10-19', { paceFactor: 1.02 }), note('2026-10-26')]} goalSeconds={GOAL} />)

    expect(screen.getByText(/2% easier/)).toBeInTheDocument()
  })
})

describe('predicted race time', () => {
  it('lists fitness week by week and says how far it has come', () => {
    render(
      <PredictedTimes
        notes={[note('2026-10-19', { fitness: '00:58:30' }), note('2026-10-26'), note('2026-11-02', { fitness: '00:56:40' })]}
        goalSeconds={GOAL}
      />,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/1:50 quicker than when the coach first had a view/)).toBeInTheDocument()
  })

  it('shows nothing without a fitness estimate', () => {
    const { container } = render(<PredictedTimes notes={[note('2026-10-19', { paceFactor: 1.02 })]} goalSeconds={GOAL} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('a faster goal', () => {
  it('is offered after strong weeks, and taken only when the runner says so', async () => {
    const onUseGoal = vi.fn()
    render(
      <CoachNote
        note={note('2026-11-02', { verdict: 'Thriving', reasons: ['FeltEasierThanPlanned', 'ThrivingTwice'], doseStep: 1 })}
        fasterGoal={50 * 60}
        onUseGoal={onUseGoal}
      />,
    )

    expect(screen.getByText(/50:00 is within reach/)).toBeInTheDocument()
    expect(onUseGoal).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use 50:00 as my goal' }))

    expect(onUseGoal).toHaveBeenCalledWith(3000)
  })
})
