import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import type { ActivitySummary } from '../../lib/types'
import { WeekGlance } from './WeekGlance'
import { WeekDays } from './WeekList'
import { sessionKey } from './plan-math'

const week = planFixture.weeks[0]!
const strength = week.sessions.find((s) => s.type === 'Strength')!
const uploaded = { id: 'extra-run', localDate: strength.date, kind: 'Run', distanceKm: 5 } as ActivitySummary
const dayState = () => screen.getByText(/, Strength & mobility/).closest('li')!

describe('strength stays separate from running', () => {
  it('shows an additional run on a rest day without completing running or strength sessions', () => {
    const { container } = render(<WeekGlance week={week} done={new Set()} additionalDates={['2026-10-14', strength.date, '2026-10-13']} today="2026-10-18" units="km" />)
    const days = container.querySelectorAll('.week-day')
    expect(days[2]).toHaveClass('is-done')
    expect(days[2]).toHaveTextContent('rest, done, additional run logged')
    expect(days[0]).not.toHaveClass('is-done')
    expect(days[1]).not.toHaveClass('is-done')
  })
  it('does not tick strength from a running activity on the same date', () => {
    render(<WeekGlance week={week} done={new Set()} runs={new Map([[strength.date, [uploaded]]])} today={strength.date} units="km" />)
    expect(dayState()).not.toHaveClass('is-done')
  })

  it('ticks strength only when its own session is completed', () => {
    render(<WeekGlance week={week} done={new Set([sessionKey(strength)])} today={strength.date} units="km" />)
    expect(dayState()).toHaveClass('is-done')
  })

  it('requires strength completion even when a run on the same day is recorded', () => {
    const running = { ...week.sessions.find((s) => s.type !== 'Strength')!, date: strength.date }
    render(<WeekGlance week={{ ...week, sessions: [strength, running] }} done={new Set()} runs={new Map([[strength.date, [uploaded]]])} today={strength.date} units="km" />)
    expect(dayState()).not.toHaveClass('is-done')
  })

  it('labels strength distinctly with exercises rather than running pace or coaching controls', () => {
    const { container } = render(<WeekDays week={{ ...week, sessions: [strength] }} byZone={new Map()} units="km" done={new Set()} onDoneChange={vi.fn()} />)
    const card = container.querySelector('.session-strength')!
    expect(card).toHaveTextContent('Strength')
    expect(card).toHaveTextContent(`${strength.exercises.length} exercises`)
    expect(card).toHaveTextContent('About this session')
    expect(card).not.toHaveTextContent('How to run it')
    expect(card).not.toHaveTextContent('/km')
  })
})
