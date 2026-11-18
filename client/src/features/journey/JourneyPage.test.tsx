import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Activity, ActivitySummary } from '../../lib/types'
import { JourneyPage } from './JourneyPage'
import { journeyOf, raceResult } from './journey-fixtures'
import { majorDefinitions, raceMemory } from './race-history-fixtures'
import type { RaceHistory } from './types'
import { useRaceHistory } from './useRaceHistory'
import { renderHook } from '@testing-library/react'

const auth = { ...accountsOff, enabled: true, account: { id: 'test-runner', name: 'Test runner', email: 'test@example.test' }, getToken: async () => 'test-token' }
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
const show = () => render(<JourneyPage units="km" today="2026-11-15" onNewRace={vi.fn()} onArchived={vi.fn()} />, { wrapper })

beforeEach(() => {
  window.history.replaceState(null, '', '/?view=journey&section=races')
  vi.spyOn(api.me.journey, 'get').mockResolvedValue(journeyOf([]))
  vi.spyOn(api.me, 'activities').mockResolvedValue([])
})
afterEach(() => vi.restoreAllMocks())

describe('permanent race history and trophy cabinet', () => {
  it('reuses an existing recording’s date and actual elapsed metrics without typing them again', async () => {
    const recording: ActivitySummary = { id: 'recording', localDate: '2026-04-26', startedAt: '2026-04-26T08:00:00Z', kind: 'Run', distanceKm: 42.4,
      movingSeconds: 14000, paceSecondsPerKm: 330, plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
      source: { kind: 'Strava', viewUrl: null, recordedOnGarmin: false, cachedUntil: null } }
    vi.mocked(api.me.activities).mockResolvedValue([recording])
    vi.spyOn(api.me, 'activity').mockResolvedValue({ ...recording, elapsedSeconds: 14612 } as unknown as Activity)
    vi.spyOn(api.me.journey, 'races').mockResolvedValue({ races: [], majors: majorDefinitions })
    const save = vi.spyOn(api.me.journey, 'saveRace').mockResolvedValue(raceMemory())
    const user = userEvent.setup()
    show()
    // A Major is recorded from its medal in the cabinet, which fills in the event.
    await user.click(await screen.findByRole('button', { name: /^London A finish still to come Record a finish$/ }))
    expect(screen.getByLabelText('Event collection')).toHaveValue('London')
    expect(screen.getByLabelText('Event distance (km)')).toHaveValue('42.195')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Use a recorded run (optional)' }), recording.id)
    expect(screen.getByLabelText('Event date')).toHaveValue('2026-04-26')
    await user.click(screen.getByRole('button', { name: 'Continue to result' }))
    expect(screen.getByRole('heading', { name: 'We found your London Marathon.' })).toBeVisible()
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('test-token', expect.any(String), expect.objectContaining({
      eventName: 'London Marathon', eventDistanceKm: 42.195, raceDate: '2026-04-26', finishTime: '04:03:32', distanceKm: 42.4,
      activityId: recording.id, timeKind: 'RecordedElapsed', outcome: 'Finished',
    })))
  })

  it('offers the Nelson Mandela Marathon in the cabinet and reuses a matching October Strava marathon', async () => {
    const recording: ActivitySummary = { id: 'mandela-strava', localDate: '2026-10-18', startedAt: '2026-10-18T05:00:00Z', kind: 'Run', distanceKm: 42.34,
      movingSeconds: 15800, paceSecondsPerKm: 373, plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
      source: { kind: 'Strava', viewUrl: null, recordedOnGarmin: false, cachedUntil: null } }
    vi.mocked(api.me.activities).mockResolvedValue([recording])
    vi.spyOn(api.me, 'activity').mockResolvedValue({ ...recording, elapsedSeconds: 16920 } as unknown as Activity)
    vi.spyOn(api.me.journey, 'races').mockResolvedValue({ races: [], majors: majorDefinitions })
    const save = vi.spyOn(api.me.journey, 'saveRace').mockResolvedValue(raceMemory({ eventName: 'Nelson Mandela Marathon', eventDistanceKm: 42.195, major: null }))
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: /Nelson Mandela Marathon.*Link a recorded finish/ }))
    expect(await screen.findByRole('heading', { name: 'Save a race to your journey' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Race name' })).toHaveValue('Nelson Mandela Marathon')
    expect(await screen.findByLabelText('Event date')).toHaveValue('2026-10-18')
    await user.click(screen.getByRole('button', { name: 'Continue to result' }))
    expect(await screen.findByRole('heading', { name: 'We found your Nelson Mandela Marathon.' })).toBeVisible()
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('test-token', expect.any(String), expect.objectContaining({
      eventName: 'Nelson Mandela Marathon', eventDistanceKm: 42.195, raceDate: '2026-10-18',
      distanceKm: 42.34, finishTime: '04:42:00', activityId: recording.id, outcome: 'Finished', timeKind: 'RecordedElapsed',
    })))
  })

  it('holds legacy duplicates for explicit review instead of choosing a trophy-winning outcome', async () => {
    vi.spyOn(api.me.journey, 'races').mockResolvedValue({ races: [raceMemory({ needsReview: true, majorEligible: false }),
      raceMemory({ needsReview: true, majorEligible: false, result: raceResult({ id: 'other-result', outcome: 'DidNotFinish', finishTime: null }) })], majors: majorDefinitions })
    show()
    expect(within(await screen.findByRole('list', { name: 'Saved races' })).getAllByRole('listitem')).toHaveLength(2)
    expect(await screen.findByText(/Some older races have more than one saved result/)).toBeVisible()
    expect(screen.getByRole('button', { name: /^London A finish still to come Record a finish$/ })).toBeVisible()
    expect(screen.queryByRole('list', { name: 'All race finishes' })).not.toBeInTheDocument()
  })

  it('keeps a failed new-race form, retries with the same id and retains the acknowledged result if refresh fails', async () => {
    vi.spyOn(api.me.journey, 'races').mockResolvedValueOnce({ races: [], majors: majorDefinitions }).mockRejectedValue(new Error('Refresh unavailable'))
    const save = vi.spyOn(api.me.journey, 'saveRace').mockRejectedValueOnce(new Error('Save unavailable')).mockImplementation(async (_token, id, body) =>
      raceMemory({ result: raceResult({ id, planId: null, raceDate: body.raceDate, finishTime: body.finishTime ?? null, distanceKm: body.distanceKm ?? null, timeKind: body.timeKind }) }))
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: /^London A finish still to come Record a finish$/ }))
    await user.type(screen.getByLabelText('Event date'), '2026-04-26')
    await user.click(screen.getByRole('button', { name: 'Continue to result' }))
    // One date and one outcome choice: the result form starts at Finished and doesn't ask for the date again.
    expect(screen.getByRole('radio', { name: 'Finished' })).toBeChecked()
    expect(screen.queryByLabelText('Race date')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Hours' }), '4')
    await user.selectOptions(screen.getByLabelText('Time source'), 'OfficialChip')
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    expect(await screen.findByText('Save unavailable')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Hours' })).toHaveValue('4')
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    const film = await screen.findByRole('dialog', { name: 'RACE FINISHED.' })
    expect(within(film).getByText('Official chip time')).toBeVisible()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[0]?.[1]).toBe(save.mock.calls[1]?.[1])
    expect(save.mock.calls[1]?.[2]).toMatchObject({ eventName: 'London Marathon', eventDistanceKm: 42.195, raceDate: '2026-04-26', finishTime: '04:00:00', timeKind: 'OfficialChip' })
    await user.click(within(film).getByRole('button', { name: 'Back to my journey' }))
    expect(await screen.findByRole('list', { name: 'Saved races' })).toHaveTextContent('London Marathon')
    expect(await screen.findByText(/Showing your races as last loaded/)).toBeVisible()
    expect(await screen.findByRole('button', { name: /^London Finished.*View finishes$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^London A finish still to come Record a finish$/ })).not.toBeInTheDocument()
  })

  it('a correction to DNF removes the finisher medal while preserving the race in history', async () => {
    let memory = raceMemory()
    vi.spyOn(api.me.journey, 'races').mockImplementation(async () => ({ races: [memory], majors: majorDefinitions }))
    const save = vi.spyOn(api.me.journey, 'saveRace').mockImplementation(async (_token, _id, body) => {
      memory = { ...memory, majorEligible: false, result: { ...memory.result, outcome: body.outcome, finishTime: null, timeKind: 'Unspecified', version: 'next-version' } }
      return memory
    })
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Edit result for London Marathon' }))
    await user.click(screen.getByRole('button', { name: 'Continue to result' }))
    await user.click(screen.getByRole('radio', { name: 'Didn’t finish' }))
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('test-token', memory.result.id, expect.objectContaining({ outcome: 'DidNotFinish', expectedVersion: 'AAAAAAAAB9E=' })))
    expect(await screen.findByRole('list', { name: 'Saved races' })).toHaveTextContent('Didn’t finish')
    expect(await screen.findByRole('button', { name: /^London A finish still to come Record a finish$/ })).toBeVisible()
    expect(screen.queryByRole('list', { name: 'All race finishes' })).not.toBeInTheDocument()
  })

  it('does not erase a saved race when removal fails and sends its version on retry', async () => {
    let races = [raceMemory()]
    vi.spyOn(api.me.journey, 'races').mockImplementation(async () => ({ races, majors: majorDefinitions }))
    const remove = vi.spyOn(api.me.journey, 'deleteRace').mockRejectedValueOnce(new Error('Changed on another device')).mockImplementation(async () => { races = [] })
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Edit result for London Marathon' }))
    await user.click(screen.getByRole('button', { name: 'Remove this race result' }))
    await user.click(screen.getByRole('button', { name: 'Remove result and trophy' }))
    expect(await screen.findByText('Changed on another device')).toBeVisible()
    expect(screen.getByRole('list', { name: 'Saved races' })).toHaveTextContent('London Marathon')
    await user.click(screen.getByRole('button', { name: 'Remove result and trophy' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Saved races' })).not.toBeInTheDocument())
    expect(remove).toHaveBeenLastCalledWith('test-token', raceMemory().result.id, raceMemory().result.version)
  })

  it('keeps every finish, repeat editions and non-qualifying older events visible without extra Majors', async () => {
    const memories = [raceMemory(), raceMemory({ result: raceResult({ id: 'repeat', planId: null, raceDate: '2025-04-27' }) }),
      raceMemory({ eventName: 'Sydney Marathon', major: 'Sydney', majorEligible: false, result: raceResult({ id: 'old-sydney', planId: null, raceDate: '2024-09-15' }) }),
      raceMemory({ eventName: 'Local half', major: null, majorEligible: false, eventDistanceKm: 21.1, result: raceResult({ id: 'local', planId: null }) })]
    vi.spyOn(api.me.journey, 'races').mockResolvedValue({ races: memories, majors: majorDefinitions })
    const user = userEvent.setup()
    show()
    expect(await screen.findByRole('button', { name: /^London Finished.*View finishes$/ })).toHaveTextContent('2 times')
    expect(screen.getByRole('button', { name: /^Sydney A finish still to come Record a finish$/ })).toBeVisible()
    expect(within(screen.getByRole('list', { name: 'Saved races' })).getAllByRole('listitem')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: /^London Finished.*View finishes$/ }))
    expect(within(await screen.findByRole('list', { name: 'Saved races' })).getAllByRole('listitem')).toHaveLength(2)
    expect(new URLSearchParams(window.location.search).get('section')).toBe('races')
  })
})

describe('journey sections', () => {
  it('has two sections, and an old trophy-cabinet link opens races and trophies together', async () => {
    window.history.replaceState(null, '', '/?view=journey&section=cabinet')
    vi.spyOn(api.me.journey, 'races').mockResolvedValue({ races: [raceMemory()], majors: majorDefinitions })
    show()
    const sections = screen.getByRole('navigation', { name: 'Journey sections' })
    expect(within(sections).getAllByRole('button').map(button => button.textContent)).toEqual(['Training chapters', 'Races & trophies'])
    expect(within(sections).getByRole('button', { name: 'Races & trophies' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('list', { name: 'Saved races' })).toHaveTextContent('London Marathon')
    expect(screen.getByRole('heading', { name: 'Trophy cabinet.' })).toBeVisible()
  })

  it('asks for a Marathon Major only from its medal, keeping a new past race to name, date and distance', async () => {
    vi.spyOn(api.me.journey, 'races').mockResolvedValue({ races: [], majors: majorDefinitions })
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Add a past race' }))
    expect(screen.getByRole('textbox', { name: 'Race name' })).toBeVisible()
    expect(screen.queryByLabelText('Event collection')).not.toBeInTheDocument()
  })
})

describe('race-history request boundaries', () => {
  it('hides another account’s history and does not submit a pending-token mutation after an account switch', async () => {
    let identity: Auth = auth
    let resolveToken!: (value: string) => void
    const wrapped = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={identity}>{children}</AuthContext.Provider>
    vi.spyOn(api.me.journey, 'races').mockResolvedValueOnce({ races: [raceMemory()], majors: majorDefinitions })
      .mockRejectedValue(new Error('New account unavailable'))
    const save = vi.spyOn(api.me.journey, 'saveRace')
    const { result, rerender } = renderHook(useRaceHistory, { wrapper: wrapped })
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    identity = { ...auth, getToken: () => new Promise(resolve => { resolveToken = resolve }) }
    rerender()
    const pending = result.current.save('new-result', { eventName: 'Local 10K', eventDistanceKm: 10, raceDate: '2026-11-01', outcome: 'Finished' }).catch(reason => reason as Error)
    identity = { ...auth, account: { id: 'other-runner', name: 'Other runner', email: 'other@example.test' } }
    rerender()
    await act(async () => resolveToken('old-token'))
    expect(await pending).toMatchObject({ message: expect.stringContaining('account changed') })
    expect(save).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.state.kind).toBe('error'))
    expect(result.current.state).not.toHaveProperty('history')
  })

  it('a late old read cannot undo an acknowledged save or delete', async () => {
    let oldRead!: (value: RaceHistory) => void
    vi.spyOn(api.me.journey, 'races').mockResolvedValueOnce({ races: [], majors: majorDefinitions })
      .mockImplementationOnce(() => new Promise(resolve => { oldRead = resolve })).mockRejectedValue(new Error('Unavailable'))
    vi.spyOn(api.me.journey, 'saveRace').mockResolvedValue(raceMemory())
    vi.spyOn(api.me.journey, 'deleteRace').mockResolvedValue()
    const { result } = renderHook(useRaceHistory, { wrapper })
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    await act(async () => result.current.refresh())
    await act(async () => { await result.current.save(raceMemory().result.id, { eventName: 'London Marathon', eventDistanceKm: 42.195, raceDate: '2026-04-26', outcome: 'Finished' }) })
    await act(async () => oldRead({ races: [], majors: majorDefinitions }))
    expect(result.current.state).toMatchObject({ kind: 'ready', history: { races: [raceMemory()] } })
    await act(async () => { await result.current.remove(raceMemory()) })
    expect(result.current.state).toMatchObject({ kind: 'ready', history: { races: [] } })
  })
})
