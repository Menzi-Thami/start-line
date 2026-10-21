import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api-client'
import type { TrainingPlan } from '../../lib/types'
import { planFixture } from '../../test/server'
import { Replan } from './Replan'

// The fixture plan runs from Monday 12 October to a 5K on Sunday 13 December.
const IN_THE_PLAN = '2026-10-21'

const setup = (overrides: Partial<TrainingPlan> = {}, today = IN_THE_PLAN, units: 'km' | 'mi' = 'km') => {
  const onReplan = vi.fn<(replan: unknown) => Promise<void>>().mockResolvedValue(undefined)
  const onUseGoal = vi.fn()
  const user = userEvent.setup()
  render(<Replan plan={{ ...planFixture, ...overrides }} today={today} units={units} onReplan={onReplan} onUseGoal={onUseGoal} />)
  return { user, onReplan, onUseGoal }
}

const open = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Fell behind? Replan from here' }))
const rebuild = () => screen.getByRole('button', { name: 'Rebuild my plan' })

describe('replan from here', () => {
  it.each([
    ['before the plan starts', '2026-10-08'],
    ['within two weeks of the race', '2026-11-30'],
  ])('isn’t offered %s', (_, today) => {
    setup({}, today)

    expect(screen.queryByRole('button', { name: /Replan from here/ })).not.toBeInTheDocument()
  })

  it('rebuilds from today after the setback the runner picks', async () => {
    const { user, onReplan } = setup()
    await open(user)

    expect(rebuild()).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /I was ill/ }))
    await user.click(rebuild())

    expect(onReplan).toHaveBeenCalledWith({ from: IN_THE_PLAN, setback: 'Illness', recentWeeklyKm: undefined })
  })

  it('needs last week’s distance when the runner is behind, and sends it in kilometres', async () => {
    const { user, onReplan } = setup({}, IN_THE_PLAN, 'mi')
    await open(user)

    await user.click(screen.getByRole('radio', { name: /running less than planned/ }))
    expect(rebuild()).toBeDisabled()
    await user.type(screen.getByLabelText(/How far did you run last week\? \(mi\)/), '10')
    await user.click(rebuild())

    expect(onReplan).toHaveBeenCalledWith({ from: IN_THE_PLAN, setback: 'Behind', recentWeeklyKm: 16.1 })
  })

  it('shows why a replan didn’t work, in the form', async () => {
    const { user, onReplan } = setup()
    onReplan.mockRejectedValueOnce(new ApiError('Bad request', 400, { ReplanFrom: ['Your race is too close to rebuild the plan.'] }))
    await open(user)

    await user.click(screen.getByRole('radio', { name: /I missed some training/ }))
    await user.click(rebuild())

    expect(await screen.findByRole('alert')).toHaveTextContent('Your race is too close to rebuild the plan.')
    expect(rebuild()).toBeInTheDocument()
  })

  it('says when and why a plan was rebuilt, and can undo it', async () => {
    const { user, onReplan } = setup({ replan: { from: '2026-10-21', setback: 'Injury', recentWeeklyKm: null } })

    expect(screen.getByRole('status')).toHaveTextContent('Rebuilt from Wed 21 Oct after injury')
    await user.click(screen.getByRole('button', { name: 'Undo replan' }))

    expect(onReplan).toHaveBeenCalledWith(undefined)
  })

  it('offers the suggested goal when the old one is out of reach', async () => {
    const { user, onUseGoal } = setup({ replan: { from: '2026-10-21', setback: 'Illness', recentWeeklyKm: null }, suggestedGoal: '00:25:40' })

    await user.click(screen.getByRole('button', { name: 'Use 25:40 as my goal' }))

    expect(onUseGoal).toHaveBeenCalledWith(1540)
  })
})
