import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type Auth } from '../../app/auth-context'
import { server, stravaOff } from '../../test/server'
import { StravaWelcome } from './StravaWelcome'

const auth: Auth = {
  enabled: true, loading: false, account: { name: 'Runner', email: 'runner@example.com' },
  error: null, signIn: () => undefined, signUp: () => undefined, signOut: () => undefined,
  getToken: () => Promise.resolve('test-token'),
}

describe('optional Strava welcome', () => {
  it('offers the official connection and an explicit skip', async () => {
    server.use(http.get('*/api/v1/me/sync/strava', () => HttpResponse.json({ ...stravaOff, available: true })))
    const continueToPlan = vi.fn()
    render(<AuthContext.Provider value={auth}><StravaWelcome onContinue={continueToPlan} /></AuthContext.Provider>)

    expect(screen.getByRole('heading', { name: 'Bring your runs with you.' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Connect with Strava' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: "I'll connect later" }))
    expect(continueToPlan).toHaveBeenCalledTimes(1)
  })

  it('does not block the runner if Strava integration is unavailable', async () => {
    server.use(http.get('*/api/v1/me/sync/strava', () => HttpResponse.json(stravaOff)))
    render(<AuthContext.Provider value={auth}><StravaWelcome onContinue={() => undefined} /></AuthContext.Provider>)
    await waitFor(() => expect(screen.getByText(/Strava connections aren't available right now/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: "I'll connect later" })).toBeInTheDocument()
  })

  it('recognises an active existing connection after an OAuth return', async () => {
    server.use(http.get('*/api/v1/me/sync/strava', () => HttpResponse.json({
      ...stravaOff, available: true, connected: true, status: 'Active',
      connectedAt: '2026-11-12T06:00:00Z', lastSyncedAt: null, syncedRuns: 0,
    })))
    render(<AuthContext.Provider value={auth}><StravaWelcome notice="Strava is connected." onContinue={() => undefined} /></AuthContext.Provider>)
    expect(await screen.findByRole('button', { name: 'Continue to my plan' })).toBeInTheDocument()
  })
})
