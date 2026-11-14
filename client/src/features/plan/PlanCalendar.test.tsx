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
    expect(select).toHaveBeenLastCalledWith(`2026-10-${rest.textContent!.padStart(2, '0')}`, rest)
    const workout = days.find(button => button.getAttribute('aria-label')?.includes('Easy run'))!
    await user.click(workout)
    expect(select).toHaveBeenLastCalledWith(workout.getAttribute('data-date'), workout)
  })
})

describe('plan boundaries: rest is scheduled, not the absence of a workout', () => {
  // A custom start on Wednesday 4 November and a race on Sunday 15 November: the plan begins and ends mid-month.
  const weeks = [
    { number: 1, startDate: '2026-11-02', sessions: [{ date: '2026-11-04', type: 'Easy', title: 'Easy run', distanceKm: 5 }, { date: '2026-11-07', type: 'LongRun', title: 'Long run', distanceKm: 12 }] },
    { number: 2, startDate: '2026-11-09', sessions: [{ date: '2026-11-10', type: 'Easy', title: 'Easy run', distanceKm: 5 }, { date: '2026-11-15', type: 'Race', title: 'Race', distanceKm: 21.1 }] },
  ] as unknown as typeof planFixture.weeks
  const label = (date: string) => screen.getAllByRole('button').find(b => b.getAttribute('data-date') === date)!
  const show = (extra: Partial<Parameters<typeof PlanCalendar>[0]> = {}) =>
    render(<PlanCalendar weeks={weeks} planStart="2026-11-04" raceDate="2026-11-15" today="2026-11-20" onSelectDate={vi.fn()} done={new Set()} {...extra} />)

  it('keeps real rest days between sessions as rest', () => {
    show()
    expect(label('2026-11-05')).toHaveAttribute('aria-label', '5 November: rest')
    expect(label('2026-11-05')).toHaveClass('is-rest')
  })
  it('leaves dates after the race and before a custom start neutral', () => {
    show()
    for (const date of ['2026-11-16', '2026-11-30', '2026-11-02', '2026-11-03']) {
      expect(label(date)).toHaveClass('is-outside')
      expect(label(date).getAttribute('aria-label')).toMatch(/outside this plan$/)
    }
    expect(label('2026-11-15')).toHaveClass('is-race')
  })
  it('still shows a run recorded after the plan, without calling it prescribed', () => {
    show({ activityDates: ['2026-11-18'] })
    expect(label('2026-11-18')).toHaveClass('is-recorded')
    expect(label('2026-11-18')).toHaveAttribute('aria-label', '18 November: outside this plan, activity recorded')
  })
  it('marks only an accepted recovery plan’s own days after the race', () => {
    const recoveryDays = new Map([['2026-11-16', 'Rest'], ['2026-11-17', 'Easy walk']])
    show({
      historyDates: [...recoveryDays.keys()],
      statusFor: (date) => recoveryDays.has(date)
        ? { kind: 'recovery', icon: '◌', label: `Recovery: ${recoveryDays.get(date)}`, detail: '' }
        : { kind: 'outside', icon: '', label: 'Outside this plan' },
    })
    expect(label('2026-11-17')).toHaveClass('is-recovery')
    expect(label('2026-11-17')).toHaveAttribute('aria-label', '17 November: recovery plan, recovery: easy walk')
    expect(label('2026-11-19')).toHaveClass('is-outside')
  })
})
