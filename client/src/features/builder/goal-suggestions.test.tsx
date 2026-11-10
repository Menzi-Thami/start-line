import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlanInputs } from '../../lib/plan-url'
import { racesFixture } from '../../test/server'
import { BuilderForm } from './BuilderForm'
import { goalProblem } from './goal-limits'
import { suggestedGoals } from './goal-suggestions'

const times = (km: number) => suggestedGoals(km).map((goal) => goal.seconds)
const hm = (hours: number, minutes: number) => hours * 3600 + minutes * 60

describe('suggested goals', () => {
  it('offers three tidy, everyday times for each distance, slowest first', () => {
    expect(times(5)).toEqual([34 * 60, 29 * 60, 25 * 60])
    expect(times(10)).toEqual([hm(1, 10), hm(1, 0), 52 * 60])
    expect(times(21.0975)).toEqual([hm(2, 35), hm(2, 15), hm(1, 55)])
    expect(times(42.195)).toEqual([hm(5, 25), hm(4, 40), hm(4, 0)])
    // Ultras go by pace, inside the usual cut-offs (Two Oceans 7 h, Comrades 12 h).
    expect(times(56)).toEqual([hm(6, 50), hm(6, 5), hm(5, 20)])
    expect(times(90)).toEqual([hm(11, 0), hm(9, 45), hm(8, 40)])
    expect(suggestedGoals(0)).toEqual([])
  })

  it('never suggests a goal the builder would refuse', () => {
    for (const km of [3, 5, 8, 10, 15, 21.0975, 30, 42.195, 50, 56, 90, 100]) {
      for (const goal of suggestedGoals(km)) expect(goalProblem(km, goal.seconds, 'km')).toBeNull()
    }
  })
})

describe('the goal step', () => {
  const inputs: PlanInputs = { raceSlug: 'two-oceans-ultra-2027', goalSeconds: 21600, runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', experience: 'Regular', strengthDays: [], planFrom: '2026-10-08' }

  it('fills the goal from a suggestion in one tap', async () => {
    render(<BuilderForm races={{ kind: 'ready', races: racesFixture }} onRetryRaces={vi.fn()} initial={inputs} units="km" busy={false} serverErrors={{}} today="2026-10-28" onSubmit={vi.fn()} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Goal/ }))
    const suggestions = screen.getByRole('group', { name: 'Suggested goal times' })
    expect(within(suggestions).getAllByRole('button')).toHaveLength(3)

    const steady = within(suggestions).getByRole('button', { name: /Steady/ })
    expect(steady).toHaveAttribute('aria-pressed', 'false')
    await user.click(steady)
    expect(steady).toHaveAttribute('aria-pressed', 'true')
    expect(steady).toHaveTextContent('6:05:00')
    expect(screen.getByText(/on average/)).toBeInTheDocument()
  })
})
