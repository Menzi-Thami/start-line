import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Runner } from '../../lib/types'
import { ACCOUNT_TIMEOUT_MESSAGE, useRunner, WAKE_PATIENCE_MS } from './useRunner'

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
