import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff, type Auth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { CheckIn } from '../../lib/types'
import { planFixture, server } from '../../test/server'
import { activateCheckInOwner, clearCheckInCopies, readCheckInCopy, writeCheckInCopy } from './check-in-storage'
import { useCheckIns } from './useCheckIns'
import { OfflineRunDrafts } from './OfflineRunDrafts'

const account = { id: 'runner-a', name: 'Synthetic runner', email: null }
const auth: Auth = { ...accountsOff, enabled: true, account, getToken: async () => 'synthetic-token' }
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
const session = { ...planFixture.weeks[0]!.sessions[0]!, date: '2026-10-14', type: 'Easy' as const }
const answers = { status: 'Done' as const, effort: null, distanceKm: 7, duration: '00:42:00', note: 'My own entry', distanceUnreported: false }
const entry: CheckIn = { ...answers, date: session.date, sessionType: session.type, id: 'extra', isAdditional: true,
  pain: 'None', painArea: null, activityId: null, updatedAt: '2026-10-14T10:00:00Z', version: 'version-one' }

function connection(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
  act(() => window.dispatchEvent(new Event(online ? 'online' : 'offline')))
}

afterEach(() => { vi.restoreAllMocks() })

it('keeps an additional run through offline save, edit, unmount, reload and reconnect, exactly once', async () => {
  let entries: CheckIn[] = []
  const save = vi.fn(() => { entries = [entry]; return HttpResponse.json(entry) })
  server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json(entries)),
    http.put('*/api/v1/me/plans/:id/check-ins/additional/:entry/:date/:type', save))
  const first = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(first.result.current.ready).toBe(true))
  connection(false)
  await act(() => first.result.current.saveAdditional('extra', session, { ...answers, distanceKm: 6 }))
  await act(() => first.result.current.saveAdditional('extra', session, answers))
  expect(first.result.current.entries[0]?.distanceKm).toBe(7)
  expect(first.result.current.pending).toHaveLength(1)
  expect(save).not.toHaveBeenCalled()
  first.unmount()
  const second = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(second.result.current.entries[0]?.distanceKm).toBe(7))
  expect(second.result.current.pending).toHaveLength(1)
  connection(true)
  await waitFor(() => expect(second.result.current.pending).toHaveLength(0))
  expect(save).toHaveBeenCalledOnce()
  expect(second.result.current.entries).toHaveLength(1)
  second.unmount()
  const third = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(third.result.current.entries[0]?.id).toBe('extra'))
  expect(third.result.current.pending).toHaveLength(0)
})

it('acknowledges a save whose response was lost, without another write or duplicate run', async () => {
  let entries: CheckIn[] = []
  server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json(entries)))
  const save = vi.spyOn(api.me, 'saveAdditionalRun').mockImplementationOnce(async () => { entries = [entry]; throw new ApiError('Connection lost', 0) })
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  await act(() => result.current.saveAdditional('extra', session, answers))
  expect(result.current.pending).toHaveLength(1)
  await act(() => result.current.syncNow())
  expect(result.current.pending).toHaveLength(0)
  expect(save).toHaveBeenCalledOnce()
  expect(result.current.entries).toHaveLength(1)
})

it('keeps a conflicting draft and requires an explicit choice before replacing another device’s entry', async () => {
  let remote = entry
  const save = vi.fn(({ request }: { request: Request }) => request.json().then(body => {
    remote = { ...entry, ...body, version: 'version-three' }; return HttpResponse.json(remote)
  }))
  server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([remote])),
    http.put('*/api/v1/me/plans/:id/check-ins/additional/:entry/:date/:type', save))
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  connection(false)
  await act(() => result.current.saveAdditional('extra', session, { ...answers, distanceKm: 8 }))
  remote = { ...entry, distanceKm: 9, version: 'version-two' }
  connection(true)
  await waitFor(() => expect(result.current.syncError).toMatch(/another device/))
  expect(result.current.entries[0]?.distanceKm).toBe(8)
  expect(remote.distanceKm).toBe(9)
  expect(save).not.toHaveBeenCalled()
  act(() => result.current.resolvePending('extra', true))
  await waitFor(() => expect(result.current.pending).toHaveLength(0))
  expect(remote.distanceKm).toBe(8)
  expect(save).toHaveBeenCalledOnce()
})

it('can discard one conflicting draft without changing the account entry', async () => {
  writeCheckInCopy(account.id, 'one', { entries: [entry], pending: [{ key: 'extra', revision: 'one', additionalId: 'extra', date: entry.date,
    sessionType: entry.sessionType, base: { ...entry, distanceKm: 5 }, answers }] })
  connection(false)
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(result.current.pending).toHaveLength(1))
  act(() => result.current.resolvePending('extra', false))
  await waitFor(() => expect(result.current.pending).toHaveLength(0))
  expect(result.current.entries[0]?.distanceKm).toBe(7)
})

it('never queues imported measurements or claims success when device storage is full', async () => {
  writeCheckInCopy(account.id, 'one', { entries: [], pending: [] })
  connection(false)
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  await expect(result.current.saveAdditional('extra', session, { ...answers, activityId: 'imported' })).rejects.toThrow(/Reconnect before linking/)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
  await expect(result.current.saveAdditional('extra', session, answers)).rejects.toThrow(/couldn’t keep your run/)
  expect(result.current.pending).toHaveLength(0)
})

it('taking back an unsent run cancels it without contacting the API', async () => {
  writeCheckInCopy(account.id, 'one', { entries: [], pending: [] })
  connection(false)
  const remove = vi.spyOn(api.me, 'deleteAdditionalRun')
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  await act(() => result.current.saveAdditional('extra', session, answers))
  await act(() => result.current.removeAdditional('extra'))
  expect(result.current.pending).toHaveLength(0)
  expect(result.current.entries).toHaveLength(0)
  expect(remove).not.toHaveBeenCalled()
})

it('isolates accounts and plans and clears every draft on sign-out', async () => {
  writeCheckInCopy(account.id, 'one', { entries: [entry], pending: [] })
  connection(false)
  const { result, rerender } = renderHook(({ planId }) => {
    return useCheckIns(planId)
  }, { wrapper, initialProps: { accountId: account.id, planId: 'one' } })
  await waitFor(() => expect(result.current.entries).toHaveLength(1))
  rerender({ accountId: account.id, planId: 'two' })
  expect(result.current.entries).toHaveLength(0)
  expect(readCheckInCopy('runner-b', 'one')).toBeNull()
  act(() => activateCheckInOwner('runner-b'))
  expect(readCheckInCopy(account.id, 'one')).toBeNull()
  act(() => clearCheckInCopies())
  expect(localStorage.getItem('taperday:check-ins:v1')).toBeNull()
})

it('keeps a rejected sync through retry, including its manual time and note', async () => {
  writeCheckInCopy(account.id, 'one', { entries: [], pending: [] })
  connection(false)
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await act(() => result.current.saveAdditional('extra', session, answers))
  server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([])))
  const save = vi.spyOn(api.me, 'saveAdditionalRun').mockRejectedValueOnce(new ApiError('Try again', 503)).mockResolvedValueOnce(entry)
  connection(true)
  await waitFor(() => expect(result.current.syncError).toBe('Try again'))
  expect(result.current.entries[0]).toMatchObject({ duration: '00:42:00', note: 'My own entry' })
  expect(readCheckInCopy(account.id, 'one')?.pending).toHaveLength(1)
  await act(() => result.current.syncNow())
  expect(result.current.pending).toHaveLength(0)
  expect(save).toHaveBeenCalledTimes(2)
})

it('preserves an edit made while the previous draft is syncing', async () => {
  writeCheckInCopy(account.id, 'one', { entries: [], pending: [] })
  connection(false)
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await act(() => result.current.saveAdditional('extra', session, answers))
  let remote: CheckIn[] = []
  server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json(remote)))
  let release!: (entry: CheckIn) => void
  const save = vi.spyOn(api.me, 'saveAdditionalRun').mockImplementationOnce(() => new Promise<CheckIn>(resolve => { release = resolve })
    .then(saved => { remote = [saved]; return saved }))
    .mockImplementationOnce(async () => { const saved = { ...entry, distanceKm: 8, version: 'version-two' }; remote = [saved]; return saved })
  connection(true)
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  await act(() => result.current.saveAdditional('extra', session, { ...answers, distanceKm: 8 }))
  await act(async () => { release(entry) })
  await waitFor(() => expect(result.current.pending).toHaveLength(0))
  expect(result.current.entries).toHaveLength(1)
  expect(result.current.entries[0]?.distanceKm).toBe(8)
  expect(save).toHaveBeenLastCalledWith('synthetic-token', 'one', 'extra', session.date, 'Easy',
    expect.objectContaining({ distanceKm: 8, expectedVersion: 'version-one', expectMissing: false }))
})

it('keeps acknowledged online saves visible even if the device copy cannot be updated', async () => {
  server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([entry])))
  vi.spyOn(api.me, 'saveAdditionalRun').mockResolvedValue({ ...entry, distanceKm: 8 })
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
  await act(() => result.current.saveAdditional('extra', session, { ...answers, distanceKm: 8 }))
  expect(result.current.entries[0]?.distanceKm).toBe(8)
  expect(result.current.pending).toHaveLength(0)
})

it('never submits a queued entry after its account changes while a token is being acquired', async () => {
  writeCheckInCopy(account.id, 'one', { entries: [], pending: [] })
  connection(false)
  let release!: (value: string) => void
  const delayed = new Promise<string>(resolve => { release = resolve })
  let currentAuth: Auth = { ...auth, getToken: () => delayed }
  const provider = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={currentAuth}>{children}</AuthContext.Provider>
  const { result, rerender } = renderHook(() => useCheckIns('one'), { wrapper: provider })
  await act(() => result.current.saveAdditional('extra', session, answers))
  const save = vi.spyOn(api.me, 'saveAdditionalRun')
  connection(true)
  currentAuth = { ...auth, account: { ...account, id: 'runner-b' } }
  rerender()
  expect(result.current.entries).toHaveLength(0)
  await act(async () => { release('old-account-token'); await delayed })
  expect(save).not.toHaveBeenCalled()
})

it('makes unsent entries from a replaced plan available for review', async () => {
  writeCheckInCopy(account.id, 'old-plan', { entries: [], pending: [{ key: 'extra', revision: 'one', additionalId: 'extra',
    date: session.date, sessionType: 'Easy', base: null, answers }] })
  connection(false)
  render(<OfflineRunDrafts activePlanId="new-plan" />, { wrapper })
  expect(await screen.findByRole('region', { name: 'Device drafts from other plans' })).toHaveTextContent('Saved on this device')
  expect(screen.getByRole('button', { name: 'Review device drafts' })).toBeVisible()
})

it('does not let writes to another plan strand the first load of the current plan', async () => {
  let release!: (entries: CheckIn[]) => void
  const pending = new Promise<CheckIn[]>(resolve => { release = resolve })
  const load = vi.spyOn(api.me, 'checkIns').mockReturnValueOnce(pending)
  const { result } = renderHook(() => useCheckIns('current-plan'), { wrapper })
  await waitFor(() => expect(load).toHaveBeenCalledOnce())
  act(() => writeCheckInCopy(account.id, 'another-plan', { entries: [entry], pending: [] }))
  await act(async () => { release([]); await pending })
  expect(result.current.ready).toBe(true)
  expect(result.current.entries).toEqual([])
})

it('offers explicit sign-in after a rejected token without discarding or submitting the draft', async () => {
  const expired = { ...auth, getToken: async () => null, signIn: vi.fn() }
  writeCheckInCopy(account.id, 'one', { entries: [], pending: [{ key: 'extra', revision: 'one', additionalId: 'extra',
    date: session.date, sessionType: 'Easy', base: null, answers }] })
  const save = vi.spyOn(api.me, 'saveAdditionalRun')
  render(<AuthContext.Provider value={expired}><OfflineRunDrafts activePlanId="another-plan" /></AuthContext.Provider>)
  const signIn = await screen.findByRole('button', { name: 'Sign in again' })
  fireEvent.click(signIn)
  expect(expired.signIn).toHaveBeenCalledOnce()
  expect(readCheckInCopy(account.id, 'one')?.pending).toHaveLength(1)
  expect(save).not.toHaveBeenCalled()
})
