import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { Runner } from '../../lib/types'
import { server } from '../../test/server'
import { ProfileForm } from '../account/ProfileForm'

const TOKEN = 'test-token'

const sipho: Runner = {
  id: 'runner-2',
  displayName: 'Sipho',
  email: 'sipho@example.com',
  timeZone: 'Africa/Johannesburg',
  units: 'Kilometres',
  weeklyEmails: false,
  consentedAt: '2026-10-09T09:00:00Z',
  maxHeartRate: null,
  privacyNoticeVersion: '2026-10-09',
  needsPrivacyConsent: true,
  heartRateConsent: false,
}

const signedIn: Auth = {
  enabled: true,
  loading: false,
  account: { name: 'Sipho', email: 'sipho@example.com' },
  error: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getToken: () => Promise.resolve(TOKEN),
}

function renderWith(ui: React.ReactElement, auth?: Auth) {
  const user = userEvent.setup()
  render(auth ? <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider> : ui)
  return user
}

describe('the privacy policy', () => {
  it('is public, one click from the footer, and names who is responsible and how to reach them', async () => {
    const user = renderWith(<App />)

    await user.click(screen.getByRole('button', { name: 'Privacy policy' }))

    const policy = screen.getByRole('article', { name: 'Privacy policy' })
    expect(window.location.search).toBe('?view=privacy')
    expect(within(policy).getByText(/run by Thamsanqa Menzi/)).toBeInTheDocument()
    expect(within(policy).getAllByRole('link', { name: 'paulmenzi@outlook.com' })[0]).toHaveAttribute('href', 'mailto:paulmenzi@outlook.com')
    expect(within(policy).getByText(/Heart rate, only if you agree/)).toBeInTheDocument()
    expect(within(policy).getByText(/7 days at a time/)).toBeInTheDocument()
    expect(within(policy).getByText(/We never keep the files you upload, your route or GPS positions/)).toBeInTheDocument()
  })

  it('opens straight from a link', () => {
    window.history.replaceState(null, '', '/?view=privacy')
    renderWith(<App />)

    expect(screen.getByRole('heading', { name: 'Privacy policy', level: 2 })).toBeInTheDocument()
  })
})

describe('signing up', () => {
  function profileApi() {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.put('*/api/v1/me', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        return HttpResponse.json({ ...sipho, needsPrivacyConsent: false, heartRateConsent: body.heartRateConsent === true })
      }),
    )
    return bodies
  }

  it('asks for heart rate separately, and leaves it off unless ticked', async () => {
    const bodies = profileApi()
    const saved = vi.fn()
    const user = renderWith(<ProfileForm onSaved={saved} />, signedIn)

    expect(screen.getByText(/Heart rate only if you agree below/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Keep heart rate from my runs (optional)' })).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: /I’ve read this/ }))
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(bodies[0]).toMatchObject({ acceptPrivacyNotice: true, heartRateConsent: false })
  })

  it('sends heart-rate consent when the runner ticks it', async () => {
    const bodies = profileApi()
    const saved = vi.fn()
    const user = renderWith(<ProfileForm onSaved={saved} />, signedIn)

    await user.click(screen.getByRole('checkbox', { name: /I’ve read this/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Keep heart rate from my runs (optional)' }))
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(bodies[0]).toMatchObject({ heartRateConsent: true })
  })

  it('lets a runner withdraw heart-rate consent from their profile, saying what happens', async () => {
    const bodies = profileApi()
    const saved = vi.fn()
    const user = renderWith(<ProfileForm runner={{ ...sipho, needsPrivacyConsent: false, heartRateConsent: true }} onSaved={saved} />, signedIn)

    expect(screen.getByText(/Untick it and we delete the heart rate we hold straight away/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Keep heart rate from my runs (optional)' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(bodies[0]).toMatchObject({ heartRateConsent: false })
  })
})

describe('a runner on an older notice', () => {
  function outdatedApi() {
    const accepted: Record<string, unknown>[] = []
    server.use(
      http.get('*/api/v1/me', () => HttpResponse.json(sipho)),
      http.get('*/api/v1/me/plans', () => HttpResponse.json([])),
      http.put('*/api/v1/me/privacy', async ({ request }) => {
        const body = (await request.json()) as { heartRateConsent: boolean }
        accepted.push(body)
        return HttpResponse.json({ ...sipho, privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false, heartRateConsent: body.heartRateConsent })
      }),
    )
    return accepted
  }

  it('reads and accepts the new notice before anything else, with heart rate still a separate choice', async () => {
    const accepted = outdatedApi()
    window.history.replaceState(null, '', '/?view=plans')
    const user = renderWith(<App />, signedIn)

    expect(await screen.findByRole('heading', { name: 'We’ve updated what we keep' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My plans' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Accept and carry on' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please read and accept the updated notice to carry on.')
    expect(accepted).toHaveLength(0)

    await user.click(screen.getByRole('checkbox', { name: /I’ve read this/ }))
    await user.click(screen.getByRole('button', { name: 'Accept and carry on' }))

    expect(await screen.findByRole('heading', { name: 'My plans' })).toBeInTheDocument()
    expect(accepted).toEqual([{ heartRateConsent: false }])
  })

  it('can still read the policy, or go to Account to download or delete instead', async () => {
    outdatedApi()
    const user = renderWith(<App />, signedIn)

    await user.click(await screen.findByRole('button', { name: 'Download or delete my data instead' }))

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Privacy policy' }))
    expect(screen.getByRole('heading', { name: 'Privacy policy', level: 2 })).toBeInTheDocument()
  })
})
