import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { ActivitySummary, LoggedRun, Runner, TrainingPlan } from '../../lib/types'
import plan from '../../test/fixtures/plan-5k.json'
import { server } from '../../test/server'
import { defaultBeginnerProgress } from '../beginner/beginner-progress'
import { chapter, journeyOf, maintenance, PLAN_ID, raceResult, recovery } from '../journey/journey-fixtures'
import type { Journey } from '../journey/types'
import type { JourneyActions } from '../journey/useJourney'
import { Home } from './Home'

const auth = { ...accountsOff, enabled: true, account: { name: 'Synthetic runner', email: 'home@example.test' }, getToken: async () => 'test-token' }
const runner = { id: 'home-runner', displayName: 'Naledi', maxHeartRate: null } as Runner
const recorded = { id: 'recording', localDate: '2026-11-15', source: { kind: 'Strava' } } as ActivitySummary
afterEach(() => vi.restoreAllMocks())
beforeEach(() => server.use(http.get('*/api/v1/me/beginner', () => new HttpResponse(null, { status: 204 }))))

function show(data: Journey, props: Partial<Parameters<typeof Home>[0]> = {}) {
  const onOpenJourney = vi.fn(), onOpenRecovery = vi.fn(), onBuildPlan = vi.fn()
  const actions = { refresh: vi.fn() } as unknown as JourneyActions
  render(<AuthContext.Provider value={auth}><Home today="2026-11-16" runner={runner} units="km" current={null}
    runs={[recorded]} strava={{ available: true, connected: false } as never}
    journey={{ state: { kind: 'ready', journey: data, refreshFailed: false }, actions }}
    onOpenJourney={onOpenJourney} onOpenRecovery={onOpenRecovery} onBuildPlan={onBuildPlan}
    onOpenPlan={vi.fn()} onOpenRun={vi.fn()} onOpenRuns={vi.fn()} onOpenAccount={vi.fn()} {...props} /></AuthContext.Provider>)
  return { user: userEvent.setup(), onOpenJourney, onOpenRecovery, onBuildPlan }
}

function expectQuietHome() {
  expect(screen.queryByRole('region', { name: 'This week' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Latest run' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Add training feedback/)).not.toBeInTheDocument()
  expect(screen.queryByText('Something to run towards?')).not.toBeInTheDocument()
  expect(screen.queryByText(/Couch to 5K/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Connect Strava' })).not.toBeInTheDocument()
  expect(screen.queryByText(/^Coaching, insights and tools/)).not.toBeInTheDocument()
  expect(document.querySelectorAll('.home-focus > .journey-home')).toHaveLength(1)
  expect(screen.getByText(/^Your running/, { selector: 'summary' }).closest('details')).not.toHaveAttribute('open')
}

it('waits for the current chapter before loading a dashboard or prompting for another plan', () => {
  const running = vi.spyOn(api.me, 'running')
  const allTime = vi.spyOn(api.me, 'allTimeRunning')
  const readiness = vi.spyOn(api.me, 'readiness')
  show(journeyOf([]), { journey: { state: { kind: 'loading' }, actions: {} as JourneyActions } })
  expect(screen.getByRole('status', { name: 'Loading your current chapter' })).toBeVisible()
  expect(screen.queryByText('Something to run towards?')).not.toBeInTheDocument()
  expect(running).not.toHaveBeenCalled()
  expect(allTime).not.toHaveBeenCalled()
  expect(readiness).not.toHaveBeenCalled()
})

it('gives concluded training one race-review action and no training dashboard or repeat questions', async () => {
  const opened = show(journeyOf([chapter({ status: 'Concluded', lifecycle: 'Concluded' })]))
  expectQuietHome()
  expect(screen.getByText('Training concluded')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Start recovery plan' })).not.toBeInTheDocument()
  expect(screen.queryByText('Race finisher')).not.toBeInTheDocument()
  await opened.user.click(screen.getByRole('button', { name: 'Review my race' }))
  expect(opened.onOpenJourney).toHaveBeenCalledWith(PLAN_ID)
})

it('keeps recovery first even when the runner has already saved future training', async () => {
  const coach = vi.spyOn(api.me, 'coachPlan')
  const future = { id: 'next-training', name: 'Parkrun PB', inputs: { raceDate: '2026-12-13' } as never }
  const opened = show(journeyOf([chapter({ status: 'Concluded', raceResult: raceResult() })], { recovery: recovery() }),
    { current: future, initialPlan: { id: future.id, plan: plan as unknown as TrainingPlan } })
  expectQuietHome()
  await opened.user.click(screen.getByRole('button', { name: 'Open recovery plan' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledOnce()
  expect(coach).not.toHaveBeenCalled()
})

it.each(['Finished', 'DidNotFinish'] as const)('offers one recovery action for a confirmed %s, using the saved race', async outcome => {
  const result = raceResult({ outcome })
  const opened = show(journeyOf([chapter({ status: 'Concluded', lifecycle: 'Concluded', raceResult: result })]))
  expectQuietHome()
  expect(document.querySelectorAll('.journey-home button')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Review my race' })).not.toBeInTheDocument()
  await opened.user.click(screen.getByRole('button', { name: 'Start recovery plan' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledWith(result.id)
})

it.each([
  { status: 'Paused' as const, seekCare: false, safetyMessage: null },
  { status: 'Active' as const, seekCare: true, safetyMessage: 'Stop exercise and seek medical advice.' },
])('keeps recovery safety and pause state visible without bringing training prompts back: %o', state => {
  show(journeyOf([], { recovery: recovery(state) }))
  expectQuietHome()
  expect(screen.getByRole('button', { name: 'Open recovery plan' })).toBeVisible()
  if (state.seekCare) expect(screen.getByRole('alert')).toHaveTextContent(state.safetyMessage!)
  else expect(screen.getByRole('heading', { name: 'Recovery paused' })).toBeVisible()
})

it.each(['Completed', 'Ended'] as const)('keeps %s recovery focused on the next chapter after race week has passed', async status => {
  const opened = show(journeyOf([chapter({ status: 'Concluded' })], { recovery: recovery({ status }) }), { today: '2026-12-02' })
  expectQuietHome()
  expect(screen.getByRole('button', { name: 'Train for another race' })).toBeVisible()
  await opened.user.click(screen.getByRole('button', { name: "Choose what's next" }))
  expect(opened.onOpenRecovery).toHaveBeenCalledOnce()
  await opened.user.click(screen.getByRole('button', { name: 'Train for another race' }))
  expect(opened.onBuildPlan).toHaveBeenCalledOnce()
})

it('lets runners start another race directly from the easy-running Home card', async () => {
  const opened = show(journeyOf([], { maintenance: maintenance() }))
  expectQuietHome()
  expect(screen.getByRole('heading', { name: 'Keep running comfortably.' })).toBeVisible()
  expect(screen.queryByRole('list', { name: 'Coming up' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open easy running' })).toBeVisible()
  await opened.user.click(screen.getByRole('button', { name: 'Train for another race' }))
  expect(opened.onBuildPlan).toHaveBeenCalledOnce()
  expect(opened.onOpenRecovery).not.toHaveBeenCalled()
  await opened.user.click(screen.getByRole('button', { name: 'Open easy running' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledOnce()
})

it('preserves the runner’s history instead of restarting onboarding months after the plan', async () => {
  const opened = show(journeyOf([chapter({ raceDate: '2026-04-12', status: 'Archived', lifecycle: 'Archived' })]))
  expectQuietHome()
  expect(screen.getByRole('heading', { name: 'Take your time.' })).toBeVisible()
  await opened.user.click(screen.getByRole('button', { name: 'View my journey' }))
  expect(opened.onOpenJourney).toHaveBeenCalledWith(PLAN_ID)
})

it('loads running details only on request and preserves access to the calculators', async () => {
  let resolve!: (runs: LoggedRun[]) => void
  const running = vi.spyOn(api.me, 'running').mockImplementation(() => new Promise(done => { resolve = done }))
  const allTime = vi.spyOn(api.me, 'allTimeRunning').mockResolvedValue([])
  const readiness = vi.spyOn(api.me, 'readiness')
  const opened = show(journeyOf([chapter({ status: 'Concluded' })], { recovery: recovery() }))
  expectQuietHome()
  expect(running).not.toHaveBeenCalled()
  expect(allTime).not.toHaveBeenCalled()
  expect(readiness).not.toHaveBeenCalled()
  await opened.user.click(screen.getByText(/^Your running/, { selector: 'summary' }))
  await waitFor(() => expect(running).toHaveBeenCalledWith('test-token', true))
  expect(allTime).toHaveBeenCalledWith('test-token')
  await opened.user.click(screen.getByText(/^Running insights/, { selector: 'summary' }))
  expect(screen.getByRole('status', { name: 'Loading running totals' })).toBeVisible()
  await act(async () => resolve([]))
  await opened.user.click(screen.getByText(/^Running tools/, { selector: 'summary' }))
  expect(await screen.findByRole('region', { name: 'Calculators' })).toBeVisible()
  expect(readiness).not.toHaveBeenCalled()
})

it('keeps bookmarked tools working after recovery without reopening training', async () => {
  window.history.replaceState(null, '', '/?view=home&tab=tools')
  show(journeyOf([chapter({ status: 'Concluded' })], { recovery: recovery({ status: 'Completed' }) }))
  expect(await screen.findByRole('region', { name: 'Calculators' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
})

it('retains access to a saved beginner programme inside running details', async () => {
  const onOpenBeginner = vi.fn()
  server.use(http.get('*/api/v1/me/beginner', () => HttpResponse.json({ ...defaultBeginnerProgress('2026-11-09'), week: 2, completed: ['0:1:1'] })))
  const opened = show(journeyOf([chapter({ status: 'Concluded' })]), { onOpenBeginner })
  expectQuietHome()
  await opened.user.click(screen.getByText(/^Your running/, { selector: 'summary' }))
  expect(await screen.findByRole('heading', { name: 'Couch to 5K' })).toBeVisible()
  expect(screen.getByText('Week 2 of 9')).toBeVisible()
  await opened.user.click(screen.getByRole('button', { name: 'Open Couch to 5K' }))
  expect(onOpenBeginner).toHaveBeenCalledOnce()
})
