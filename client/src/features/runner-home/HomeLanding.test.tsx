import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { server } from '../../test/server'
import { chapter, journeyOf, raceResult, recovery } from '../journey/journey-fixtures'

const auth = { ...accountsOff, enabled: true, account: { id: 'home-runner', name: 'Naledi', email: 'home@example.test' }, getToken: async () => 'test-token' }
const runner = { id: 'home-runner', displayName: 'Naledi', email: 'home@example.test', timeZone: 'UTC', units: 'Kilometres',
  needsPrivacyConsent: false, privacyNoticeVersion: '2026-10-21', maxHeartRate: null, heartRateConsent: false, weeklyEmails: false }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

it.each(['Concluded', 'Recovering', 'Recovered'] as const)('keeps Home available on a fresh device after %s, without opening recovery automatically', async phase => {
  const training = chapter({ raceDate: '2026-11-14', status: 'Concluded', lifecycle: 'Concluded', raceResult: phase === 'Concluded' ? null : raceResult() })
  const data = journeyOf([training], { recovery: phase === 'Concluded' ? null : recovery({ status: phase === 'Recovering' ? 'Active' : 'Completed' }) })
  server.use(
    http.get('*/api/v1/me', () => HttpResponse.json(runner)),
    http.get('*/api/v1/me/plans', () => HttpResponse.json([])),
    http.get('*/api/v1/me/journey', () => HttpResponse.json(data)),
    http.get('*/api/v1/me/beginner', () => new HttpResponse(null, { status: 204 })),
  )
  window.history.replaceState(null, '', '/')
  const user = userEvent.setup()
  render(<AuthContext.Provider value={auth}><App /></AuthContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'Welcome back, Naledi', level: 1 })).toBeVisible()
  expect(window.location.search).toBe('?view=home')
  expect(screen.queryByRole('heading', { name: 'Your recovery plan.' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Which race?' })).not.toBeInTheDocument()
  const navigation = screen.getByRole('navigation', { name: 'Main' })
  expect(within(navigation).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  const action = phase === 'Concluded' ? 'Review my race' : phase === 'Recovering' ? 'Open recovery plan' : "Choose what's next"
  expect(screen.getByRole('button', { name: action })).toBeVisible()
  await user.click(within(navigation).getByRole('button', { name: 'Runs' }))
  expect(await screen.findByRole('heading', { name: 'Runs', level: 2 })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Taperday' }))
  expect(screen.getByRole('heading', { name: 'Welcome back, Naledi', level: 1 })).toBeVisible()
  expect(screen.getByRole('button', { name: action })).toBeVisible()
  expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
})
