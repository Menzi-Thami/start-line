import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { ActivitySummary, PersonalBest, StravaStatus } from '../../lib/types'
import { stravaOff } from '../../test/server'
import { POLL_MS, VISIBLE_POLL_MS, useSyncedRuns } from './useSyncedRuns'

const auth: Auth = { enabled: true, loading: false, account: { id: 'runner-a', name: 'Runner A', email: null }, error: null,
  signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), getToken: () => Promise.resolve('token-a') }
const connected: StravaStatus = { ...stravaOff, available: true, connected: true, status: 'Active' }
const run = { id: 'phone-run', startedAt: '2026-11-17T06:00:00Z', localDate: '2026-11-17', kind: 'Run',
  distanceKm: 5, movingSeconds: 1800, source: { kind: 'Strava', addedAt: '2026-11-17T06:30:00Z' } } as ActivitySummary
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const settle = () => act(async () => { await Promise.resolve() })
function setup(enabled = true) {
  return renderHook(({ on }) => useSyncedRuns(on, false), {
    initialProps: { on: enabled },
    wrapper: ({ children }: { children: ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T06:35:00Z'))
  vi.spyOn(api.me, 'activities').mockResolvedValue([])
  vi.spyOn(api.me, 'bests').mockResolvedValue([])
  vi.spyOn(api.me.strava, 'status').mockResolvedValue(connected)
  vi.spyOn(api.me.strava, 'catchUp').mockResolvedValue(connected)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('recordings and automatic imports without a training plan', () => {
  it('loads recordings immediately and requests catch-up without waiting for status or loading bests', async () => {
    const status = deferred<StravaStatus>()
    vi.mocked(api.me.strava.status).mockReturnValue(status.promise)
    vi.mocked(api.me.activities).mockResolvedValue([run])
    const { result } = setup()
    await settle()
    expect(result.current.runs).toEqual([run])
    expect(result.current.syncing).toBe(true)
    expect(api.me.bests).not.toHaveBeenCalled()
    await act(async () => status.resolve(connected))
    expect(api.me.strava.catchUp).toHaveBeenCalledWith('token-a')
    expect(result.current.strava).toEqual(connected)
  })

  it('polls a pending import into the visible recordings and stops frequent polling when complete', async () => {
    vi.mocked(api.me.strava.catchUp).mockResolvedValue({ ...connected, pending: 1 })
    const { result } = setup()
    await settle()
    expect(result.current.runs).toEqual([])
    vi.mocked(api.me.strava.status).mockResolvedValue({ ...connected, syncedRuns: 1, lastSyncedAt: '2026-11-17T06:35:00Z' })
    vi.mocked(api.me.activities).mockResolvedValue([run])
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS))
    expect(result.current.runs).toEqual([run])
    expect(result.current.newArrival?.id).toBe(run.id)
    const checks = vi.mocked(api.me.strava.status).mock.calls.length
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS))
    expect(api.me.strava.status).toHaveBeenCalledTimes(checks)
    act(() => result.current.dismissArrival())
    await act(async () => result.current.reload())
    expect(result.current.newArrival).toBeNull()
  })

  it('reconciles missed webhooks on the visible timer and after returning from another app', async () => {
    const { result } = setup()
    await settle()
    vi.mocked(api.me.activities).mockResolvedValue([run])
    await act(async () => vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS))
    expect(result.current.runs).toEqual([run])
    expect(api.me.strava.catchUp).toHaveBeenCalledTimes(2)
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(api.me.strava.catchUp).toHaveBeenCalledTimes(3)
  })

  it('keeps loaded recordings on a failed refresh, reports the failure and retries', async () => {
    vi.mocked(api.me.activities).mockResolvedValue([run])
    const { result } = setup()
    await settle()
    vi.mocked(api.me.activities).mockRejectedValue(new Error('Connection lost'))
    vi.mocked(api.me.strava.status).mockRejectedValue(new Error('Import check unavailable'))
    await act(async () => result.current.refresh())
    expect(result.current.runs).toEqual([run])
    expect(result.current.error).toBe('Connection lost')
    expect(result.current.syncError).toBe('Import check unavailable')
    vi.mocked(api.me.activities).mockResolvedValue([run])
    vi.mocked(api.me.strava.status).mockResolvedValue(connected)
    await act(async () => result.current.refresh())
    expect(result.current.error).toBeNull()
    expect(result.current.syncError).toBeNull()
    expect(result.current.runs).toEqual([run])
  })

  it('distinguishes a failed initial load from an empty journal and can retry it', async () => {
    vi.mocked(api.me.activities).mockRejectedValue(new Error('Run history unavailable'))
    const { result } = setup()
    await settle()
    expect(result.current.runs).toBeUndefined()
    expect(result.current.error).toBe('Run history unavailable')
    vi.mocked(api.me.activities).mockResolvedValue([run])
    await act(async () => result.current.reload())
    expect(result.current.runs).toEqual([run])
    expect(result.current.error).toBeNull()
  })

  it('drops expired provider copies and their bests even when the refresh fails, preserving uploads', async () => {
    const cached = { ...run, source: { ...run.source, cachedUntil: '2026-11-17T06:35:10Z' } }
    const upload = { ...run, id: 'my-upload', source: { kind: 'Upload' } } as ActivitySummary
    vi.mocked(api.me.activities).mockResolvedValue([cached, upload])
    vi.mocked(api.me.bests).mockResolvedValue([{ activityId: run.id, source: 'Strava' }, { activityId: upload.id, source: 'Upload' }] as PersonalBest[])
    const { result } = renderHook(() => useSyncedRuns(true), {
      wrapper: ({ children }: { children: ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>,
    })
    await settle()
    expect(result.current.runs).toHaveLength(2)
    expect(result.current.bests).toHaveLength(2)
    vi.mocked(api.me.activities).mockRejectedValue(new Error('Offline'))
    await act(async () => vi.advanceTimersByTimeAsync(10_100))
    expect(result.current.runs).toEqual([upload])
    expect(result.current.bests?.map(best => best.activityId)).toEqual([upload.id])
    expect(result.current.error).toBe('Offline')
  })

  it('ignores stale refreshes after a newer successful read', async () => {
    const { result } = setup()
    await settle()
    const old = deferred<ActivitySummary[]>()
    vi.mocked(api.me.activities).mockReturnValueOnce(old.promise).mockResolvedValue([run])
    let first!: Promise<void>
    act(() => { first = result.current.reload() })
    await settle()
    await act(async () => result.current.reload())
    await act(async () => { old.resolve([]); await first })
    expect(result.current.runs).toEqual([run])
  })

  it('never shows the previous account’s data or accepts its late responses', async () => {
    let owner = auth
    const delayed = deferred<ActivitySummary[]>()
    vi.mocked(api.me.activities).mockReturnValueOnce(delayed.promise)
    vi.mocked(api.me.strava.status).mockResolvedValue(stravaOff)
    const { result, rerender } = renderHook(() => useSyncedRuns(true, false), {
      wrapper: ({ children }: { children: ReactNode }) => <AuthContext.Provider value={owner}>{children}</AuthContext.Provider>,
    })
    await settle()
    owner = { ...auth, account: { id: 'runner-b', name: 'Runner B', email: null }, getToken: () => Promise.resolve('token-b') }
    vi.mocked(api.me.activities).mockResolvedValue([])
    rerender()
    expect(result.current.runs).toBeUndefined()
    await settle()
    expect(result.current.runs).toEqual([])
    await act(async () => delayed.resolve([run]))
    expect(result.current.runs).toEqual([])
    expect(api.me.activities).toHaveBeenLastCalledWith('token-b')
  })

  it('does not poll hidden pages, disconnected accounts or disabled screens', async () => {
    const { result, rerender } = setup(false)
    await settle()
    expect(api.me.activities).not.toHaveBeenCalled()
    rerender({ on: true })
    await settle()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const before = vi.mocked(api.me.strava.status).mock.calls.length
    await act(async () => vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS * 2))
    expect(api.me.strava.status).toHaveBeenCalledTimes(before)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.mocked(api.me.strava.status).mockResolvedValue({ ...connected, status: 'NeedsReconnect', pending: 2 })
    await act(async () => result.current.refresh())
    const after = vi.mocked(api.me.strava.catchUp).mock.calls.length
    const disconnectedChecks = vi.mocked(api.me.strava.status).mock.calls.length
    await act(async () => vi.advanceTimersByTimeAsync(VISIBLE_POLL_MS * 2))
    expect(api.me.strava.catchUp).toHaveBeenCalledTimes(after)
    expect(api.me.strava.status).toHaveBeenCalledTimes(disconnectedChecks)
    rerender({ on: false })
    const disabled = vi.mocked(api.me.activities).mock.calls.length
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(api.me.activities).toHaveBeenCalledTimes(disabled)
  })
})
