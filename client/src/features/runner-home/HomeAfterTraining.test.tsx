import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { ActivitySummary, LoggedRun, Runner, TrainingPlan } from '../../lib/types'
import plan from '../../test/fixtures/plan-5k.json'
import { server } from '../../test/server'
import { openHomeLibrary } from '../../test/user-navigation'
import { defaultBeginnerProgress } from '../beginner/beginner-progress'
import { chapter, journeyOf, maintenance, PLAN_ID, raceResult, recovery } from '../journey/journey-fixtures'
import type { Journey } from '../journey/types'
import type { JourneyActions } from '../journey/useJourney'
import { Home } from './Home'
const auth = { ...accountsOff, enabled: true, account: { name: 'Synthetic runner', email: 'home@example.test' }, getToken: async () => 'test-token' }
const runner = { id: 'home-runner', displayName: 'Naledi', maxHeartRate: null } as Runner
const recorded = { id: 'recording', localDate: '2026-11-15', startedAt: '2026-11-15T06:00:00Z', distanceKm: 20.3, movingSeconds: 7575, source: { kind: 'Strava', cachedUntil: '2027-01-01T00:00:00Z' } } as ActivitySummary
afterEach(() => vi.restoreAllMocks())
beforeEach(() => { window.history.replaceState(null, '', '/?view=home'); server.use(http.get('*/api/v1/me/beginner', () => new HttpResponse(null, { status: 204 }))) })
function show(data: Journey, props: Partial<Parameters<typeof Home>[0]> = {}) {
  const onOpenJourney = vi.fn(), onOpenRecovery = vi.fn(), onBuildPlan = vi.fn()
  const actions = { refresh: vi.fn() } as unknown as JourneyActions
  render(<AuthContext.Provider value={auth}><Home today="2026-11-16" runner={runner} units="km" current={null} runs={[recorded]}
    journey={{ state: { kind: 'ready', journey: data, refreshFailed: false }, actions }}
    onOpenJourney={onOpenJourney} onOpenRecovery={onOpenRecovery} onBuildPlan={onBuildPlan}
    onOpenPlan={vi.fn()} onOpenRun={vi.fn()} onOpenRuns={vi.fn()} onOpenAccount={vi.fn()} {...props} /></AuthContext.Provider>)
  return { user: userEvent.setup(), onOpenJourney, onOpenRecovery, onBuildPlan }
}
function expectQuietHome() {
  for (const name of ['This week', 'Latest run', 'Today', 'Calculators']) expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
  expect(screen.queryByText(/Add training feedback|Coaching, insights and tools|Couch to 5K/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Connect Strava' })).not.toBeInTheDocument()
  expect(document.querySelectorAll('.home-focus > .journey-home')).toHaveLength(1)
  expect(document.querySelectorAll('.home-focus .button-primary')).toHaveLength(1)
  expect(screen.getByRole('region', { name: 'Recent activity' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Welcome back, Naledi' })).toBeVisible()
}
it('waits for the current chapter without loading details or offering another plan', () => {
  const running = vi.spyOn(api.me, 'running'), allTime = vi.spyOn(api.me, 'allTimeRunning'), readiness = vi.spyOn(api.me, 'readiness')
  show(journeyOf([]), { journey: { state: { kind: 'loading' }, actions: {} as JourneyActions } })
  expect(screen.getByRole('status', { name: 'Loading your current chapter' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Choose my next challenge' })).not.toBeInTheDocument()
  for (const request of [running, allTime, readiness]) expect(request).not.toHaveBeenCalled()
})
it('keeps an existing beginner programme as the only Home priority without resetting progress', async () => {
  server.use(http.get('*/api/v1/me/beginner', () => HttpResponse.json({ ...defaultBeginnerProgress('2026-11-09'), week: 2, completed: ['0:1:1'] })))
  const onOpenBeginner = vi.fn()
  const { user } = show(journeyOf([]), { onOpenBeginner })
  await screen.findByRole('heading', { name: 'Couch to 5K' })
  await waitFor(() => expect(document.querySelectorAll('.home-focus .button-primary')).toHaveLength(1))
  expect(screen.queryByRole('button', { name: 'Choose my next challenge' })).not.toBeInTheDocument()
  expect(screen.getByText(/Week 2 of 9/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Open Couch to 5K' }))
  expect(onOpenBeginner).toHaveBeenCalledOnce()
})
it('gives concluded training one race-review action without awarding a finish', async () => {
  const opened = show(journeyOf([chapter({ status: 'Concluded', lifecycle: 'Concluded' })]))
  expectQuietHome()
  expect(screen.getByText('Training concluded')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Start recovery plan' })).not.toBeInTheDocument()
  expect(screen.queryByText('Race finisher')).not.toBeInTheDocument()
  await opened.user.click(screen.getByRole('button', { name: 'Review my race' }))
  expect(opened.onOpenJourney).toHaveBeenCalledWith(PLAN_ID)
})
it('lets a newer current plan take priority over a previous recovery without destroying history', () => {
  const future = { id: 'next-training', name: 'Parkrun PB', inputs: { raceDate: '2026-12-13' } as never }
  show(journeyOf([chapter({ status: 'Concluded', raceResult: raceResult() })], { recovery: recovery() }), { current: future, initialPlan: { id: future.id, plan: plan as unknown as TrainingPlan } })
  expect(screen.getByRole('region', { name: 'Today' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Open recovery plan' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open your plan' })).toBeVisible()
})
it.each(['Finished', 'DidNotFinish'] as const)('offers one recovery action for a confirmed %s using the saved race', async outcome => {
  const result = raceResult({ outcome })
  const opened = show(journeyOf([chapter({ status: 'Concluded', lifecycle: 'Concluded', raceResult: result })]))
  expectQuietHome()
  expect(screen.queryByRole('button', { name: 'Review my race' })).not.toBeInTheDocument()
  await opened.user.click(screen.getByRole('button', { name: 'Start recovery plan' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledWith(result.id)
})
it('offers a new challenge after DNS without implying a race effort', async () => {
  const opened = show(journeyOf([chapter({ status: 'Concluded', raceResult: raceResult({ outcome: 'DidNotStart' }) })]))
  expectQuietHome()
  expect(screen.queryByRole('button', { name: 'Start recovery plan' })).not.toBeInTheDocument()
  await opened.user.click(screen.getByRole('button', { name: 'Choose my next challenge' }))
  expect(opened.onBuildPlan).toHaveBeenCalledOnce()
})
it.each([
  { status: 'Paused' as const, seekCare: false, safetyMessage: null },
  { status: 'Active' as const, seekCare: true, safetyMessage: 'Stop exercise and seek medical advice.' },
])('retains relevant safety and pause guidance after scheduled dates: %o', state => {
  show(journeyOf([], { recovery: recovery(state) }), { today: '2026-12-02' })
  expectQuietHome()
  expect(screen.getByRole('button', { name: 'Open recovery plan' })).toBeVisible()
  if (state.seekCare) expect(screen.getByRole('alert')).toHaveTextContent(state.safetyMessage!)
  else expect(screen.getByRole('heading', { name: 'Recovery paused' })).toBeVisible()
})
it.each(['Active', 'Completed', 'Ended'] as const)('keeps an elapsed %s recovery calm without a completion mutation or readiness claim', async status => {
  const opened = show(journeyOf([chapter({ status: 'Concluded' })], { recovery: recovery({ status }) }), { today: '2026-12-02' })
  expectQuietHome()
  expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible()
  expect(screen.queryByText(/You’re recovered|Finish recovery/)).not.toBeInTheDocument()
  await opened.user.click(screen.getByRole('button', { name: 'Choose my next challenge' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledOnce()
  expect(opened.onBuildPlan).not.toHaveBeenCalled()
})
it('opens the optional easy-running plan as one priority', async () => {
  const opened = show(journeyOf([], { maintenance: maintenance() }))
  expectQuietHome()
  await opened.user.click(screen.getByRole('button', { name: 'Open easy running' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledOnce()
  expect(opened.onBuildPlan).not.toHaveBeenCalled()
})
it('keeps experienced runners on Home months after training without restarting onboarding', async () => {
  const opened = show(journeyOf([chapter({ raceDate: '2026-04-12', status: 'Archived', lifecycle: 'Archived' })]))
  expectQuietHome()
  await opened.user.click(screen.getByRole('button', { name: 'Choose my next challenge' }))
  expect(opened.onBuildPlan).toHaveBeenCalledOnce()
})
it('defers detailed totals and calculators until an explicit destination is opened', async () => {
  let resolve!: (runs: LoggedRun[]) => void
  const running = vi.spyOn(api.me, 'running').mockImplementation(() => new Promise(done => { resolve = done }))
  const allTime = vi.spyOn(api.me, 'allTimeRunning').mockResolvedValue([]), readiness = vi.spyOn(api.me, 'readiness')
  show(journeyOf([chapter({ status: 'Concluded' })], { recovery: recovery() }))
  expectQuietHome()
  for (const request of [running, allTime, readiness]) expect(request).not.toHaveBeenCalled()
  await openHomeLibrary('insights')
  await waitFor(() => expect(running).toHaveBeenCalledWith('test-token', true))
  expect(allTime).toHaveBeenCalledWith('test-token')
  expect(screen.getByRole('status', { name: 'Loading running totals' })).toBeVisible()
  await act(async () => resolve([]))
  await userEvent.click(screen.getByText(/^Running tools/, { selector: 'summary' }))
  expect(await screen.findByRole('region', { name: 'Calculators' })).toBeVisible()
  expect(readiness).not.toHaveBeenCalled()
})
it('keeps bookmarked tools usable after recovery without opening training', async () => {
  window.history.replaceState(null, '', '/?view=home&tab=tools')
  show(journeyOf([chapter({ status: 'Concluded' })], { recovery: recovery({ status: 'Completed' }) }))
  expect(await screen.findByRole('region', { name: 'Calculators' })).toBeVisible()
  expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument()
})
it('retains a saved beginner programme in the deliberately opened running details', async () => {
  const onOpenBeginner = vi.fn()
  server.use(http.get('*/api/v1/me/beginner', () => HttpResponse.json({ ...defaultBeginnerProgress('2026-11-09'), week: 2, completed: ['0:1:1'] })))
  show(journeyOf([chapter({ status: 'Concluded' })]), { onOpenBeginner })
  expectQuietHome()
  await openHomeLibrary('insights')
  expect(await screen.findByRole('heading', { name: 'Couch to 5K' })).toBeVisible()
  expect(screen.getByText('Week 2 of 9')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Open Couch to 5K' }))
  expect(onOpenBeginner).toHaveBeenCalledOnce()
})
