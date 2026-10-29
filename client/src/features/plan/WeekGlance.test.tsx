import { fireEvent, render, screen } from '@testing-library/react'
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
  it('opens rest days by date and supports keyboard movement across the week', () => {
    const select = vi.fn()
    render(<WeekGlance week={week} onSelectDate={select} done={new Set()} today="2026-10-18" units="km" />)
    const days = screen.getAllByRole('button')
    days[0]!.focus()
    fireEvent.keyDown(days[0]!, { key: 'ArrowRight' })
    expect(days[1]).toHaveFocus()
    fireEvent.keyDown(days[1]!, { key: 'End' })
    expect(days.at(-1)).toHaveFocus()
    fireEvent.click(days[2]!)
    expect(select).toHaveBeenCalledWith('2026-10-14', days[2])
  })

  it('marks a running activity without claiming the prescribed running session is complete', () => {
    const running = week.sessions.find(session => session.type !== 'Strength')!
    const { container } = render(<WeekGlance week={{ ...week, sessions: [running] }} onSelectDate={vi.fn()} done={new Set()} runs={new Map([[running.date, [{ ...uploaded, localDate: running.date }]]])} today="2026-10-18" units="km" />)
    const marker = container.querySelectorAll('.week-day')[1]!
    expect(marker).toHaveClass('has-activity')
    expect(marker).not.toHaveClass('is-done')
    expect(marker.querySelector('button')).toHaveAccessibleName(/no completion recorded, activity recorded/)
  })
  it('shows an additional run on a rest day without completing running or strength sessions', () => {
    const { container } = render(<WeekGlance week={week} onSelectDate={vi.fn()} done={new Set()} additionalDates={['2026-10-14', strength.date, '2026-10-13']} today="2026-10-18" units="km" />)
    const days = container.querySelectorAll('.week-day')
    expect(days[2]).toHaveClass('is-done')
    expect(days[2]).toHaveTextContent('rest, done, additional run logged')
    expect(days[0]).not.toHaveClass('is-done')
    expect(days[1]).not.toHaveClass('is-done')
  })
  it('does not tick strength from a running activity on the same date', () => {
    render(<WeekGlance week={week} onSelectDate={vi.fn()} done={new Set()} runs={new Map([[strength.date, [uploaded]]])} today={strength.date} units="km" />)
    expect(dayState()).not.toHaveClass('is-done')
  })

  it('ticks strength only when its own session is completed', () => {
    render(<WeekGlance week={week} onSelectDate={vi.fn()} done={new Set([sessionKey(strength)])} today={strength.date} units="km" />)
    expect(dayState()).toHaveClass('is-done')
  })

  it('requires strength completion even when a run on the same day is recorded', () => {
    const running = { ...week.sessions.find((s) => s.type !== 'Strength')!, date: strength.date }
    render(<WeekGlance week={{ ...week, sessions: [strength, running] }} onSelectDate={vi.fn()} done={new Set()} runs={new Map([[strength.date, [uploaded]]])} today={strength.date} units="km" />)
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
