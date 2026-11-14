import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { chapter, journeyOf, PLAN_ID, raceResult, recovery } from './journey-fixtures'
import type { Journey } from './types'
import { useJourney } from './useJourney'

const auth = { ...accountsOff, enabled: true, account: { name: 'Test runner', email: 'test@example.test' }, getToken: async () => 'test-token' }
const initial = journeyOf([chapter()])
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
afterEach(() => vi.restoreAllMocks())

describe('Journey writes and refresh failures', () => {
  it('keeps a confirmed result, its recovery, and its undo visible when subsequent reads fail', async () => {
    vi.spyOn(api.me.journey, 'get').mockResolvedValueOnce(initial).mockRejectedValue(new Error('Refresh unavailable'))
    vi.spyOn(api.me.journey, 'saveRaceResult').mockResolvedValue(raceResult())
    vi.spyOn(api.me.journey, 'startRecovery').mockResolvedValue(recovery())
    vi.spyOn(api.me.journey, 'deleteRaceResult').mockResolvedValue()
    const { result } = renderHook(() => useJourney(true), { wrapper })
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    await act(async () => { await result.current.actions.saveRaceResult(PLAN_ID, { outcome: 'Finished' }) })
    expect(result.current.state).toMatchObject({ kind: 'ready', refreshFailed: true, journey: { chapters: [{ raceResult: raceResult(), achievements: [] }] } })
    await act(async () => { await result.current.actions.startRecovery({ planId: PLAN_ID, eventName: 'Hoka Half', distanceKm: 21.1, raceDate: '2026-11-15', effort: 'Hard', preference: 'Walk' }) })
    expect(result.current.state).toMatchObject({ kind: 'ready', journey: { recovery: recovery() } })
    await act(async () => { await result.current.actions.deleteRaceResult(PLAN_ID) })
    expect(result.current.state).toMatchObject({ kind: 'ready', journey: { chapters: [{ raceResult: null, achievements: [] }] } })
  })

  it('a read started before confirmation cannot erase the successful write', async () => {
    let complete!: (journey: Journey) => void
    vi.spyOn(api.me.journey, 'get').mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
      .mockRejectedValue(new Error('Refresh unavailable'))
    vi.spyOn(api.me.journey, 'saveRaceResult').mockResolvedValue(raceResult())
    const { result } = renderHook(() => useJourney(true), { wrapper })
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    await act(async () => result.current.actions.refresh())
    await act(async () => { await result.current.actions.saveRaceResult(PLAN_ID, { outcome: 'Finished' }) })
    await act(async () => complete(initial))
    expect(result.current.state).toMatchObject({ kind: 'ready', journey: { chapters: [{ raceResult: raceResult() }] } })
  })

  it('does not submit a write if the account changes while obtaining its token', async () => {
    let token!: (value: string) => void
    let identity: Auth = auth
    vi.spyOn(api.me.journey, 'get').mockResolvedValue(initial)
    const save = vi.spyOn(api.me.journey, 'saveRaceResult')
    const wrapped = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={identity}>{children}</AuthContext.Provider>
    const { result, rerender } = renderHook(() => useJourney(true), { wrapper: wrapped })
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    identity = { ...auth, getToken: () => new Promise(resolve => { token = resolve }) }
    rerender()
    const pending = result.current.actions.saveRaceResult(PLAN_ID, { outcome: 'Finished' }).catch(error => error as Error)
    identity = { ...auth, account: { name: 'Other runner', email: 'other@example.test' } }
    rerender()
    await act(async () => token('old-token'))
    expect(await pending).toMatchObject({ message: expect.stringContaining('account changed') })
    expect(save).not.toHaveBeenCalled()
  })

  it('hides the previous account history while another account loads and when its load fails', async () => {
    let fail!: (error: Error) => void
    let identity: Auth = auth
    vi.spyOn(api.me.journey, 'get').mockResolvedValueOnce(initial).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    const wrapped = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={identity}>{children}</AuthContext.Provider>
    const { result, rerender } = renderHook(() => useJourney(true), { wrapper: wrapped })
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    identity = { ...auth, account: { name: 'Another runner', email: 'another@example.test' } }
    rerender()
    expect(result.current.state).toEqual({ kind: 'loading' })
    await waitFor(() => expect(fail).toBeDefined())
    await act(async () => fail(new Error('Unavailable')))
    expect(result.current.state).toMatchObject({ kind: 'error', message: 'Unavailable' })
    expect(result.current.state).not.toHaveProperty('journey')
  })
})
