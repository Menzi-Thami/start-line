import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext, type Auth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Runner } from '../../lib/types'
import { PasswordCheck } from './PasswordCheck'
import { passwordCheckConfig } from './password-check-config'

const auth: Auth = { ...accountsOff, enabled: true, sessionReady: true,
  account: { id: 'qa-owner', name: 'QA Runner', email: null }, getToken: async () => 'synthetic-token' }
const view = (value: Auth) => <AuthContext.Provider value={value}><PasswordCheck /></AuthContext.Provider>
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

it('requires a distinct, explicitly configured client and the normal trusted issuer/scope', () => {
  const env = { VITE_AUTH_CLIENT_ID: '11111111-1111-4111-8111-111111111111', VITE_AUTH_AUTHORITY: 'https://taperday.ciamlogin.com/tenant/', VITE_AUTH_SCOPE: 'api://qa/Plans.ReadWrite' }
  expect(passwordCheckConfig(env)).toBeNull()
  expect(passwordCheckConfig({ ...env, VITE_AUTH_PASSWORD_CHECK_CLIENT_ID: env.VITE_AUTH_CLIENT_ID })).toBeNull()
  expect(passwordCheckConfig({ ...env, VITE_AUTH_PASSWORD_CHECK_CLIENT_ID: 'https://untrusted.example' })).toBeNull()
  expect(passwordCheckConfig({ ...env, VITE_AUTH_PASSWORD_CHECK_CLIENT_ID: '22222222-2222-4222-8222-222222222222' }))
    .toEqual({ clientId: '22222222-2222-4222-8222-222222222222', authority: env.VITE_AUTH_AUTHORITY, scope: env.VITE_AUTH_SCOPE, google: false, redirectPath: '/password-check.html' })
})

it('the unconfigured page offers ordinary sign-in without collecting credentials', () => {
  render(view(accountsOff))
  expect(screen.getByText('Password checks are not enabled on this site yet.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continue to Taperday' })).toHaveAttribute('href', '/?view=sign-in')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create a test account' })).not.toBeInTheDocument()
})

it('delegates signup and signin to Microsoft and never claims to have converted OTP accounts', async () => {
  const signUp = vi.fn(), signIn = vi.fn()
  render(view({ ...auth, account: null, sessionReady: false, signUp, signIn }))
  await userEvent.click(screen.getByRole('button', { name: 'Create a test account' }))
  await userEvent.click(screen.getByRole('button', { name: /^Sign in$/ }))
  expect(signUp).toHaveBeenCalledOnce()
  expect(signIn).toHaveBeenCalledOnce()
  expect(screen.getByText(/does not convert accounts or confirm that a password was used/)).toBeInTheDocument()
  expect(document.querySelector('input[type="password"]')).toBeNull()
})

it('only reads the existing authenticated runner on a deliberate check', async () => {
  const read = vi.spyOn(api.me, 'get').mockResolvedValue({ id: 'original-runner' } as Runner)
  const write = vi.spyOn(api.me, 'save')
  render(view(auth))
  expect(read).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Check account access' }))
  expect(await screen.findByText('Runner ID: original-runner')).toBeInTheDocument()
  expect(read).toHaveBeenCalledWith('synthetic-token', expect.any(AbortSignal))
  expect(write).not.toHaveBeenCalled()
})

it('a new identity does not silently create a runner or attach old history', async () => {
  vi.spyOn(api.me, 'get').mockRejectedValue(new ApiError('Profile missing', 403, {}, 'registration_required'))
  const write = vi.spyOn(api.me, 'save')
  render(view(auth))
  await userEvent.click(screen.getByRole('button', { name: 'Check account access' }))
  expect(await screen.findByText(/Finish setting up your profile in Taperday/)).toBeInTheDocument()
  expect(write).not.toHaveBeenCalled()
})

it('a hung token request recovers after 30 seconds and never performs a late read', async () => {
  vi.useFakeTimers()
  let release!: (token: string) => void
  const read = vi.spyOn(api.me, 'get')
  render(view({ ...auth, getToken: () => new Promise(resolve => { release = resolve }) }))
  fireEvent.click(screen.getByRole('button', { name: 'Check account access' }))
  await act(() => vi.advanceTimersByTimeAsync(30_000))
  expect(screen.getByText('The account check took too long. Try again.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check account access' })).toBeEnabled()
  await act(async () => { release('late-token'); await Promise.resolve() })
  expect(read).not.toHaveBeenCalled()
})

it('changing accounts cancels the previous read and does not block the new account', async () => {
  let release!: (runner: Runner) => void
  vi.spyOn(api.me, 'get').mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const rendered = render(view(auth))
  await userEvent.click(screen.getByRole('button', { name: 'Check account access' }))
  rendered.rerender(view({ ...auth, account: { id: 'another-owner', name: 'Another', email: null } }))
  expect(screen.getByRole('button', { name: 'Check account access' })).toBeEnabled()
  await act(async () => { release({ id: 'private-old-runner' } as Runner) })
  expect(screen.queryByText('Runner ID: private-old-runner')).not.toBeInTheDocument()
})

it('expired sessions and unmount cancel stalled work without leaving a timer or disabled retry', async () => {
  vi.useFakeTimers()
  const value = { ...auth, getToken: () => new Promise<string>(() => {}) }
  const rendered = render(view(value))
  fireEvent.click(screen.getByRole('button', { name: 'Check account access' }))
  rendered.rerender(view({ ...value, sessionReady: false }))
  rendered.rerender(view(value))
  expect(screen.getByRole('button', { name: 'Check account access' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Check account access' }))
  expect(screen.getByRole('button', { name: 'Check account access' })).toBeDisabled()
  rendered.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
