import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlanInputs } from '../../lib/plan-url'
import { racesFixture } from '../../test/server'
import { BuilderForm } from './BuilderForm'
import { eliteLimitSeconds, goalProblem, worldRecordSeconds } from './goal-limits'

describe('goal limits', () => {
  it('knows the world record at each record distance, and that longer always takes longer', () => {
    expect(worldRecordSeconds(5)).toBeCloseTo(755.36, 1)
    expect(worldRecordSeconds(42.195)).toBeCloseTo(7235, 0)
    const distances = [0.8, 1.609344, 2, 4, 7.5, 15, 30, 42.2, 56, 89, 160]
    distances.slice(1).forEach((km, i) => expect(worldRecordSeconds(km)).toBeGreaterThan(worldRecordSeconds(distances[i]!)))
  })

  it('blocks impossible and elite goals, and walking pace, but never an everyday goal', () => {
    expect(goalProblem(5, 30, 'km')).toMatch(/faster than the world record for 5 km/)
    expect(goalProblem(42.195, 110 * 60, 'km')).toMatch(/faster than the world record/)
    expect(goalProblem(42.195, 2 * 3600 + 10 * 60, 'km')).toMatch(/elite time for 42\.2 km/)
    expect(goalProblem(5, 13 * 60 + 30, 'km')).toMatch(/elite time/)
    expect(goalProblem(5, 21 * 3600, 'km')).toMatch(/slower than walking pace/)
    for (const [km, seconds] of [[5, 15 * 60], [5, 28 * 60], [10, 45 * 60], [21.0975, 2 * 3600], [42.195, 3 * 3600], [42.195, 6 * 3600], [56, 6.5 * 3600], [89, 11.5 * 3600]] as const) {
      expect(goalProblem(km, seconds, 'km')).toBeNull()
    }
    expect(Math.ceil(eliteLimitSeconds(42.195))).toBe(7959)
  })
})

describe('the goal step', () => {
  const inputs: PlanInputs = { raceSlug: 'two-oceans-ultra-2027', goalSeconds: 21600, runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', experience: 'Regular', strengthDays: [], planFrom: '2026-10-08' }

  it('flags an elite goal as the wheels turn, keeps Continue on the step, and lets an everyday goal through', async () => {
    const onSubmit = vi.fn()
    const { container } = render(<BuilderForm races={{ kind: 'ready', races: racesFixture }} onRetryRaces={vi.fn()} initial={inputs} units="km" busy={false} serverErrors={{}} today="2026-10-28" onSubmit={onSubmit} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Goal/ }))
    const [hours, minutes] = [...container.querySelectorAll<HTMLInputElement>('.wheel-input')]
    fireEvent.change(hours!, { target: { value: '3' } })
    fireEvent.change(minutes!, { target: { value: '10' } })
    expect(await screen.findByText(/3:10:00 is an elite time for 56 km/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: /goal time/i })).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(hours!, { target: { value: '6' } })
    fireEvent.change(minutes!, { target: { value: '30' } })
    expect(screen.queryByText(/elite time|world record/)).toBeNull()
    expect(screen.getByText(/on average/)).toBeInTheDocument()
  })
})
