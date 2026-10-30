import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { Runner, StravaStatus } from '../../lib/types'
import { server, stravaOff } from '../../test/server'
import { readStravaCallback } from './strava-callback'
import { StravaSection } from './StravaSection'

const auth: Auth = {
  enabled: true,
  loading: false,
  account: { name: 'Thandi', email: 'thandi@example.com' },
  error: null,
  signIn: () => undefined,
  signUp: () => undefined,
  signOut: () => undefined,
  getToken: () => Promise.resolve('test-token'),
}

const available: StravaStatus = { ...stravaOff, available: true }
const connected: StravaStatus = {
  ...available,
  connected: true,
  status: 'Active',
  includesPrivateRuns: true,
  connectedAt: '2026-10-12T06:00:00Z',
  lastSyncedAt: '2026-10-18T07:10:00Z',
  syncedRuns: 14,
}

function section(status: StravaStatus, notice?: string) {
  server.use(http.get('*/api/v1/me/sync/strava', () => HttpResponse.json(status)))
  return render(
    <AuthContext.Provider value={auth}>
      <StravaSection notice={notice} />
    </AuthContext.Provider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('connecting Strava from Account', () => {
  it('stays hidden until the Strava app is configured', async () => {
    const { container } = section(stravaOff)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('sends the runner to Strava’s own page with the official button', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    server.use(http.post('*/api/v1/me/sync/strava/authorize', () => HttpResponse.json({ authorizeUrl: 'https://www.strava.com/oauth/authorize?state=abc' })))
    section(available)

    const button = await screen.findByRole('button', { name: 'Connect with Strava' })
    expect(button.querySelector('img')).toHaveAttribute('src', '/strava/btn_strava_connect_with_orange.svg')
    await userEvent.click(button)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://www.strava.com/oauth/authorize?state=abc'))
  })

  it('says what is kept, and that location never is', async () => {
    section(available)

    expect(await screen.findByText(/never where you ran/)).toBeInTheDocument()
    expect(screen.getByText(/seven days at a time/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Powered by Strava' })).toBeInTheDocument()
  })

  it('explains how each kind of watch or phone gets runs into Strava', async () => {
    section(available)
    const user = userEvent.setup()

    await user.click(await screen.findByText('How do my runs get into Strava?'))

    for (const device of ['Garmin', 'Apple Watch or iPhone', 'Android, Samsung, Pixel or Fitbit', 'COROS, Polar, Suunto or Wahoo', 'Just a phone']) {
      expect(screen.getByText(device)).toBeVisible()
    }
  })

  it('shows how a connection stands', async () => {
    section(connected)

    expect(await screen.findByText(/14 runs from the last six weeks are in your plan, including ones you keep private on Strava/)).toBeInTheDocument()
  })

  it('asks to connect again when Strava stopped accepting access', async () => {
    section({ ...connected, status: 'NeedsReconnect' })

    expect(await screen.findByText(/stopped accepting Taperday’s access/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect with Strava' })).toBeInTheDocument()
  })

  it('disconnects only after confirming, and confirms in writing what was deleted', async () => {
    let disconnected = false
    server.use(
      http.get('*/api/v1/me/sync/strava', () => HttpResponse.json(disconnected ? available : connected)),
      http.delete('*/api/v1/me/sync/strava', () => {
        disconnected = true
        return HttpResponse.json({ deletedRuns: 14 })
      }),
    )
    render(
      <AuthContext.Provider value={auth}>
        <StravaSection />
      </AuthContext.Provider>,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect Strava' }))
    expect(disconnected).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect and delete Strava runs' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Disconnected. All 14 runs from Strava are deleted from Taperday. Your runs on Strava are untouched.')
    expect(screen.getByRole('button', { name: 'Connect with Strava' })).toBeInTheDocument()
  })

  it('shows what happened on the way back from Strava', async () => {
    section(connected, 'Strava is connected.')

    expect(await screen.findByRole('status')).toHaveTextContent('Strava is connected.')
  })
})

describe('the Strava callback', () => {
  it('reads Strava’s answer only on the callback page', () => {
    expect(readStravaCallback({ pathname: '/strava/callback', search: '?state=s&code=c&scope=read,activity:read_all' })).toEqual({
      code: 'c',
      state: 's',
      scope: 'read,activity:read_all',
      error: null,
    })
    expect(readStravaCallback({ pathname: '/strava/callback', search: '?state=s&error=access_denied' })?.error).toBe('access_denied')
    expect(readStravaCallback({ pathname: '/', search: '?code=c&state=s' })).toBeNull()
  })
})

describe('coming back from Strava', () => {
  const thandi: Runner = {
    id: 'runner-1',
    displayName: 'Thandi',
    email: 'thandi@example.com',
    timeZone: 'Africa/Johannesburg',
    units: 'Kilometres',
    weeklyEmails: false,
    consentedAt: '2026-10-08T09:00:00Z',
    maxHeartRate: null,
    privacyNoticeVersion: '2026-10-21',
    needsPrivacyConsent: false,
    heartRateConsent: true,
    updateEmails: true,
    updateEmailsOffAt: null,
  }

  it('finishes connecting with Strava’s code and state, then opens Account with the news', async () => {
    let sent: unknown
    server.use(
      http.get('*/api/v1/me', () => HttpResponse.json(thandi)),
      http.post('*/api/v1/me/sync/strava', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(connected)
      }),
      http.get('*/api/v1/me/sync/strava', () => HttpResponse.json(connected)),
    )
    window.history.replaceState(null, '', '/strava/callback?state=the-state&code=the-code&scope=read,activity:read_all')

    render(
      <AuthContext.Provider value={auth}>
        <App />
      </AuthContext.Provider>,
    )

    expect(await screen.findByText(/Strava is connected. Your runs from the last six weeks are on their way/)).toBeInTheDocument()
    expect(sent).toEqual({ code: 'the-code', state: 'the-state', scope: 'read,activity:read_all' })
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('?view=account')
  })

  it('says nothing was shared when the runner said no on Strava', async () => {
    server.use(http.get('*/api/v1/me', () => HttpResponse.json(thandi)), http.get('*/api/v1/me/sync/strava', () => HttpResponse.json(available)))
    window.history.replaceState(null, '', '/strava/callback?state=the-state&error=access_denied')

    render(
      <AuthContext.Provider value={auth}>
        <App />
      </AuthContext.Provider>,
    )

    expect(await screen.findByText('Strava wasn’t connected, and nothing was shared with Taperday.')).toBeInTheDocument()
  })
})
