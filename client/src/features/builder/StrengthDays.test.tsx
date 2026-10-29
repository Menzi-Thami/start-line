import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlanInputs } from '../../lib/plan-url'
import { racesFixture } from '../../test/server'
import { BuilderForm } from './BuilderForm'

const inputs: PlanInputs = { raceSlug: 'two-oceans-ultra-2027', goalSeconds: 21600, runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', experience: 'Regular', strengthDays: [], planFrom: '2026-10-08' }

const setup = (initial = inputs) => {
  const onSubmit = vi.fn()
  render(<BuilderForm races={{ kind: 'ready', races: racesFixture }} onRetryRaces={vi.fn()} initial={initial} units="km" busy={false} serverErrors={{}} today="2026-10-28" onSubmit={onSubmit} />)
  return { onSubmit, user: userEvent.setup() }
}

describe('strength days alongside an existing running plan', () => {
  it('explains and disables the long-run day rather than silently accepting work the generator omits', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Add strength and mobility sessions'))
    const days = within(screen.getByRole('group', { name: 'Strength days' }))
    expect(days.getByRole('checkbox', { name: 'Sunday' })).toBeDisabled()
    expect(days.getByRole('checkbox', { name: 'Monday' })).toBeEnabled()
    expect(screen.getByText(/Sunday is reserved for your long run/)).toBeInTheDocument()
  })

  it('lets an old conflicting selection be corrected instead of silently dropping it', async () => {
    const { user, onSubmit } = setup({ ...inputs, strengthDays: ['Sunday'] })
    const days = within(screen.getByRole('group', { name: 'Strength days' }))
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a strength day other than Sunday')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(days.getByRole('checkbox', { name: 'Sunday' })).toBeChecked()
    await user.click(days.getByRole('checkbox', { name: 'Sunday' }))
    await user.click(days.getByRole('checkbox', { name: 'Monday' }))
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith({ ...inputs, strengthDays: ['Monday'] })
  })
  it('changing availability preserves a historical start, build date and generator version', async () => {
    const initial = { ...inputs, startOn: '2026-10-12', version: 1 }
    const { user, onSubmit } = setup(initial)
    await user.click(screen.getByRole('button', { name: 'Change days' }))
    const days = within(screen.getByRole('group', { name: 'Which days can you run?' }))
    await user.click(days.getByRole('checkbox', { name: 'Tuesday' }))
    await user.click(days.getByRole('checkbox', { name: 'Wednesday' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ planFrom: '2026-10-08', startOn: '2026-10-12', version: 1 })
    expect(onSubmit.mock.calls[0]![0].runDays).toContain('Wednesday')
  })

})
