import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { planFixture } from '../../test/server'
import { PlanCalendar } from './PlanCalendar'

const calendar = () => render(<PlanCalendar weeks={planFixture.weeks} raceDate={planFixture.race.date} today={planFixture.startDate} done={new Set()} />)

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
  })

  it('opens the selected week and moves keyboard focus to its summary', async () => {
    calendar()
    const week = planFixture.weeks[0]!
    const details = document.createElement('details')
    details.id = `plan-week-${week.number}`
    const summary = document.createElement('summary')
    summary.textContent = 'Training week'
    details.append(summary)
    document.body.append(details)
    try {
      const day = screen.getAllByRole('button').find((b) => b.classList.contains('plan-calendar-day'))!
      await userEvent.setup().click(day)
      expect(details.open).toBe(true)
      expect(summary).toHaveFocus()
    } finally {
      details.remove()
    }
  })
})
