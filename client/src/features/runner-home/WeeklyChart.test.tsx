import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WeeklyChart } from './WeeklyChart'

const bars = [{ weekStart: '2026-10-05', km: 12, plannedKm: 15 }, { weekStart: '2026-10-12', km: 0, plannedKm: null }, { weekStart: '2026-10-19', km: 25, plannedKm: 20 }]

describe('Home history inspection', () => {
  it('has one tab stop and supports bounded arrow, Home, End and Escape navigation', () => {
    render(<WeeklyChart bars={bars} units="km" averageKm={12} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0])
    buttons[2]!.focus()
    fireEvent.keyDown(buttons[2]!, { key: 'Home' })
    expect(buttons[0]).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('12 km run, 15 km planned')
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowLeft' })
    expect(buttons[0]).toHaveFocus()
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('0 km run, no plan for this week')
    fireEvent.keyDown(buttons[1]!, { key: 'End' })
    expect(buttons[2]).toHaveFocus()
    fireEvent.keyDown(buttons[2]!, { key: 'Escape' })
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects a week on tap and keeps the accessible table and chosen units', async () => {
    const { rerender } = render(<WeeklyChart bars={bars} units="km" averageKm={12} />)
    const week = screen.getByRole('button', { name: /Week of 19 Oct/ })
    await userEvent.setup().click(week)
    expect(week).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('25 km run, 20 km planned')
    expect(screen.getByRole('table', { name: 'Weekly distance, last 12 weeks' })).toBeInTheDocument()
    rerender(<WeeklyChart bars={bars} units="mi" averageKm={12} />)
    expect(screen.getByRole('status')).toHaveTextContent('15.5 mi run, 12.4 mi planned')
  })
})
