import { AuthError } from '@azure/msal-browser'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext, type Auth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Runner } from '../../lib/types'
import { ACCOUNT_TIMEOUT_MESSAGE, accountLoadFailure, useRunner, WAKE_PATIENCE_MS } from './useRunner'

const runner = { id: 'connection-runner', displayName: 'Naledi' } as Runner
const identity = (token = 'test-token'): Auth => ({ ...accountsOff, enabled: true,
  account: { id: token, name: 'Connection QA', email: 'connection@example.test' },
  getToken: () => Promise.resolve(token) })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

function mount(auth: Auth) {
  return renderHook(() => useRunner(), { wrapper: ({ children }: { children: ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider> })
}
const flush = () => act(async () => { await Promise.resolve() })

describe('bounded account loading', () => {
  it('times out a token promise and never starts its late account request', async () => {
    vi.useFakeTimers()
    let token!: (value: string) => void
    const auth = { ...identity(), getToken: () => new Promise<string>(resolve => { token = resolve }) }
    const read = vi.spyOn(api.me, 'get').mockResolvedValue(runner)
    const view = mount(auth)
    await flush()
    await act(() => vi.advanceTimersByTimeAsync(WAKE_PATIENCE_MS))
    expect(view.result.current.state).toEqual({ kind: 'error', message: ACCOUNT_TIMEOUT_MESSAGE })
    token('late-token')
    await flush()
    expect(read).not.toHaveBeenCalled()
    view.unmount()
  })

  it('bounds an in-flight account read even when the read ignores cancellation', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.spyOn(api.me, 'get').mockImplementation((_token, value) => { signal = value; return new Promise(() => {}) })
    const view = mount(identity())
    await flush()
    await act(() => vi.advanceTimersByTimeAsync(WAKE_PATIENCE_MS))
    expect(signal?.aborted).toBe(true)
    expect(view.result.current.state).toEqual({ kind: 'error', message: ACCOUNT_TIMEOUT_MESSAGE })
    view.unmount()
  })

  it('cancels a superseded read and ignores its late response after retry succeeds', async () => {
    let old!: (value: Runner) => void
    let oldSignal: AbortSignal | undefined
    const read = vi.spyOn(api.me, 'get')
      .mockImplementationOnce((_token, signal) => { oldSignal = signal; return new Promise(resolve => { old = resolve }) })
      .mockResolvedValueOnce(runner)
    const view = mount(identity())
    await flush()
    await act(async () => { view.result.current.refresh() })
    expect(oldSignal?.aborted).toBe(true)
    expect(view.result.current.state).toEqual({ kind: 'ready', runner })
    old({ ...runner, displayName: 'Stale name' })
    await flush()
    expect(view.result.current.state).toEqual({ kind: 'ready', runner })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('cancels the latest retry on unmount, not just the first effect request', async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(api.me, 'get').mockImplementation((_token, signal) => { if (signal) signals.push(signal); return new Promise(() => {}) })
    const view = mount(identity())
    await flush()
    await act(async () => { view.result.current.refresh() })
    view.unmount()
    expect(signals).toHaveLength(2)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })

  it('hides the old account immediately while a different identity loads', async () => {
    let next!: (value: Runner) => void
    vi.spyOn(api.me, 'get').mockResolvedValueOnce(runner).mockImplementationOnce(() => new Promise(resolve => { next = resolve }))
    let auth = identity('first')
    const view = renderHook(() => useRunner(), { wrapper: ({ children }: { children: ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider> })
    await flush()
    expect(view.result.current.state.kind).toBe('ready')
    auth = identity('second')
    view.rerender()
    expect(view.result.current.state).toEqual({ kind: 'loading' })
    await flush()
    next({ ...runner, id: 'second-runner', displayName: 'Sipho' })
    await flush()
    expect(view.result.current.state).toEqual({ kind: 'ready', runner: { ...runner, id: 'second-runner', displayName: 'Sipho' } })
  })
})


describe('friendly account recovery', () => {
  it('does not expose the provider URL when a silent token request times out', async () => {
    const auth = { ...identity(), getToken: () => Promise.reject(new AuthError('timed_out', 'See https://aka.ms/msal.js.errors#timed_out for details')) }
    const view = mount(auth)
    await flush()
    expect(view.result.current.state).toEqual({
      kind: 'error',
      message: 'The connection took longer than expected. Try again to open your training.',
    })
    expect(JSON.stringify(view.result.current.state)).not.toContain('aka.ms')
    view.unmount()
  })

  it('offers deliberate renewal for Microsoft interaction-required errors', () => {
    expect(accountLoadFailure(new AuthError('login_required', 'Use https://aka.ms/ to learn more'), true)).toMatchObject({
      kind: 'error', needsSignIn: true,
    })
  })

  it('distinguishes an offline connection from a server outage without showing raw details', () => {
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(accountLoadFailure(new ApiError('SQL raw message', 503), true)).toEqual({
      kind: 'error',
      message: 'You’re offline. Reconnect to the internet, then try loading your training again.',
    })
    offline.mockRestore()
    const unavailable = accountLoadFailure(new ApiError('SQL raw message', 503), true)
    expect(unavailable).toMatchObject({ kind: 'error' })
    expect(JSON.stringify(unavailable)).not.toContain('SQL raw message')
  })
})

describe('remembered session recovery', () => {
  it('does not mistake a remembered runner with an expired token for a signed-out visitor', async () => {
    const read = vi.spyOn(api.me, 'get')
    const view = mount({ ...identity(), getToken: () => Promise.resolve(null) })
    await flush()
    expect(view.result.current.state).toEqual({
      kind: 'error',
      message: 'Your sign-in needs renewing. Continue securely to get back to your training.',
      needsSignIn: true,
    })
    expect(read).not.toHaveBeenCalled()
    view.unmount()
  })

  it('offers session recovery when the API rejects an expired token', async () => {
    vi.spyOn(api.me, 'get').mockRejectedValueOnce(new ApiError('Expired', 401))
    const view = mount(identity())
    await flush()
    expect(view.result.current.state).toMatchObject({ kind: 'error', needsSignIn: true })
    view.unmount()
  })
})
