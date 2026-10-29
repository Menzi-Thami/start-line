import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { PlanCalendar } from './PlanCalendar'

const select = vi.fn()
const calendar = () => render(<PlanCalendar weeks={planFixture.weeks} raceDate={planFixture.race.date} today={planFixture.startDate} onSelectDate={select} done={new Set()} />)

describe('training calendar navigation', () => {
  it('moves between session days with arrow keys and Home/End', () => {
    calendar()
    const days = within(screen.getByRole('region', { name: 'Your plan by month' })).getAllByRole('button').filter((b) => b.classList.contains('plan-calendar-day'))
    expect(days.length).toBeGreaterThan(1)
    days[0]!.focus()
    fireEvent.keyDown(days[0]!, { key: 'ArrowRight' })
    expect(days[1]).toHaveFocus()
    fireEvent.keyDown(days[1]!, { key: 'End' })
    expect(days.at(-1)).toHaveFocus()
    fireEvent.keyDown(days.at(-1)!, { key: 'Home' })
    expect(days[0]).toHaveFocus()
    fireEvent.keyDown(days[0]!, { key: 'ArrowDown' })
    expect(days[7]).toHaveFocus()
    fireEvent.keyDown(days[7]!, { key: 'ArrowUp' })
    expect(days[0]).toHaveFocus()
  })

  it('opens a day summary for rest days as well as workout days', async () => {
    calendar()
    const user = userEvent.setup()
    const days = screen.getAllByRole('button').filter(button => button.classList.contains('plan-calendar-day'))
    expect(days).toHaveLength(31)
    const rest = days.find(button => button.getAttribute('aria-label')?.includes(': rest'))!
    await user.click(rest)
    expect(select).toHaveBeenLastCalledWith(`2026-10-${rest.textContent!.padStart(2, '0')}`)
    const workout = days.find(button => button.getAttribute('aria-label')?.includes('Easy run'))!
    await user.click(workout)
    expect(select).toHaveBeenLastCalledWith(`2026-10-${workout.textContent!.padStart(2, '0')}`)
  })
})
