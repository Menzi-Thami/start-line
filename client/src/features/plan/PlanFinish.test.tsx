import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { planFixture } from '../../test/server'
import { chapter, journeyOf, PLAN_ID, raceResult } from '../journey/journey-fixtures'
import { PlanView } from './PlanView'

const auth = { ...accountsOff, enabled: true, account: { name: 'Synthetic runner', email: 'race@example.test' }, getToken: async () => 'test-token' }
afterEach(() => vi.restoreAllMocks())

it.each([undefined, 'week', 'all', 'progress'] as const)('leads a completed plan with the saved race and retains access to the training plan (%s)', async openTab => {
  const result = raceResult({ raceDate: planFixture.race.date })
  vi.spyOn(api.me.journey, 'get').mockResolvedValue(journeyOf([chapter({ raceName: planFixture.race.name, raceDate: planFixture.race.date, raceResult: result })]))
  render(<AuthContext.Provider value={auth}><PlanView plan={planFixture} today={planFixture.race.date} units="km" shareUrl="https://example.test/plan" journeyPlanId={PLAN_ID} onEditPlan={vi.fn()} openTab={openTab ? { id: openTab, seq: 1 } : undefined} /></AuthContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'Finished in 1:52:10' })).toBeVisible()
  const expanded = openTab === 'all' || openTab === 'progress'
  const button = screen.getByRole('button', { name: expanded ? 'Hide training plan' : 'View training plan' })
  expect(button).toHaveAttribute('aria-expanded', expanded ? 'true' : 'false')
  if (!expanded) {
    expect(screen.queryByRole('tablist', { name: 'Your plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit plan' })).not.toBeInTheDocument()
    await userEvent.click(button)
  }
  expect(screen.getByRole('tablist', { name: 'Your plan' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Edit plan' })).toBeVisible()
  await userEvent.click(screen.getByRole('tab', { name: 'Calendar' }))
  expect(screen.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { name: 'Finished in 1:52:10' })).toBeVisible()
})
