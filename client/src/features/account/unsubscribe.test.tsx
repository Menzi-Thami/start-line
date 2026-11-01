import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { Runner } from '../../lib/types'
import { server } from '../../test/server'
import { ProfileForm } from './ProfileForm'

const lerato: Runner = {
  id: 'runner-3',
  displayName: 'Lerato',
  email: 'lerato@example.com',
  timeZone: 'Africa/Johannesburg',
  units: 'Kilometres',
  weeklyEmails: false,
  consentedAt: '2026-10-09T09:00:00Z',
  maxHeartRate: null,
  privacyNoticeVersion: '2026-10-25',
  needsPrivacyConsent: false,
  heartRateConsent: false,
  updateEmails: true,
  updateEmailsOffAt: null,
}

const signedIn: Auth = {
  enabled: true,
  loading: false,
  account: { name: 'Lerato', email: 'lerato@example.com' },
  error: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getToken: () => Promise.resolve('test-token'),
}

describe('unsubscribing from an email', () => {
  it('needs no sign-in: one tap sends the link’s key and says how to turn updates back on', async () => {
    const sent: unknown[] = []
    server.use(
      http.post('*/api/v1/unsubscribe', async ({ request }) => {
        sent.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    window.history.replaceState(null, '', '/?view=unsubscribe&t=key-from-the-email')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))

    expect(await screen.findByRole('status')).toHaveTextContent('You’re unsubscribed. You can turn updates back on in Account.')
    expect(sent).toEqual([{ token: 'key-from-the-email' }])
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument()
  })

  it('words itself for the weekly recap when the link comes from one', async () => {
    server.use(http.post('*/api/v1/unsubscribe', () => new HttpResponse(null, { status: 204 })))
    window.history.replaceState(null, '', '/?view=unsubscribe&t=weekly-key&list=weekly')
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Stop the weekly recap' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You can turn the weekly recap back on in Account.')
  })

  it('says so when the link is broken, and offers no button that can’t work', async () => {
    server.use(http.post('*/api/v1/unsubscribe', () => HttpResponse.json({ title: 'Bad key', errors: { token: ['Bad key'] } }, { status: 400 })))
    window.history.replaceState(null, '', '/?view=unsubscribe&t=cut-sho')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That unsubscribe link didn’t work')
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument()
  })
})

describe('update emails in Account', () => {
  it('can be turned off and saved with the profile', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.put('*/api/v1/me', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        return HttpResponse.json({ ...lerato, updateEmails: body.updateEmails === true })
      }),
    )
    const saved = vi.fn()
    const user = userEvent.setup()
    render(
      <AuthContext.Provider value={signedIn}>
        <ProfileForm runner={lerato} onSaved={saved} />
      </AuthContext.Provider>,
    )

    const toggle = screen.getByRole('checkbox', { name: /Taperday news and updates/ })
    expect(toggle).toBeChecked()
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(bodies[0]).toMatchObject({ updateEmails: false })
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ updateEmails: false }))
  })
})
