import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Activity, ActivitySummary } from '../../lib/types'
import { chapter, journeyOf, raceResult, recovery } from './journey-fixtures'
import { RunningJourney } from './RunningJourney'
import type { PlanChapter, RaceResult } from './types'

const auth = { ...accountsOff, enabled: true, account: { name: 'Test Runner', email: 'runner@example.test' }, getToken: () => Promise.resolve('test-token') }
const past = chapter({ planId: 'past-plan', raceName: 'Past marathon', raceDate: '2026-10-18', distanceKm: 42.195, status: 'Archived' })
const run: ActivitySummary = {
  id: 'recording', startedAt: '2026-10-18T06:00:00Z', localDate: '2026-10-18', kind: 'Run', distanceKm: 42.35,
  movingSeconds: 15920, paceSecondsPerKm: 376, plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
  source: { kind: 'Strava', viewUrl: null, cachedUntil: null, recordedOnGarmin: false },
}
const show = () => render(<AuthContext.Provider value={auth}><RunningJourney units="km" today="2026-11-14" /></AuthContext.Provider>)
const result = raceResult({ planId: past.planId, finishTime: '04:40:12', raceDate: past.raceDate!, distanceKm: 42.35, activityId: run.id, versusGoal: null })

afterEach(() => vi.restoreAllMocks())

describe('Past plan race recordings', () => {
  it('confirms, edits, reloads and undoes an archived chapter result through the authenticated API', async () => {
    let saved: RaceResult | null = null
    const current = () => ({ ...past, raceResult: saved })
    vi.spyOn(api.me.journey, 'get').mockImplementation(async () => journeyOf([current()]))
    vi.spyOn(api.me.journey, 'chapter').mockImplementation(async () => current())
    vi.spyOn(api.me, 'activities').mockResolvedValue([run])
    const load = vi.spyOn(api.me, 'activity').mockResolvedValue({ ...run, elapsedSeconds: 16812 } as unknown as Activity)
    const save = vi.spyOn(api.me.journey, 'saveRaceResult').mockImplementation(async (_token, _plan, body) => {
      saved = { ...result, ...body, raceDate: body.raceDate ?? result.raceDate, version: 'next' }
      return saved
    })
    vi.spyOn(api.me.journey, 'deleteRaceResult').mockImplementation(async () => { saved = null })
    const user = userEvent.setup()
    const view = show()
    await user.click(await screen.findByRole('button', { name: 'View chapter' }))
    expect(await screen.findByRole('heading', { name: 'We found your Past marathon.' })).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    const film = await screen.findByRole('dialog', { name: 'RACE FINISHED.' })
    expect(within(film).getByText('4:40:12')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('heading', { name: 'Finished in 4:40:12' })).toBeInTheDocument()
    expect(load).toHaveBeenCalledWith('test-token', run.id)
    expect(save).toHaveBeenCalledWith('test-token', past.planId, expect.objectContaining({ activityId: run.id, finishTime: '04:40:12', distanceKm: 42.35 }))
    await user.click(screen.getByRole('button', { name: 'Edit result' }))
    await user.clear(screen.getByRole('textbox', { name: 'Minutes' }))
    await user.type(screen.getByRole('textbox', { name: 'Minutes' }), '39')
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    expect(await screen.findByRole('heading', { name: 'Finished in 4:39:12' })).toBeInTheDocument()
    view.unmount()
    show()
    await user.click(await screen.findByRole('button', { name: 'View chapter' }))
    expect(await screen.findByRole('heading', { name: 'Finished in 4:39:12' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(screen.getByRole('button', { name: 'Remove result' }))
    expect(await screen.findByRole('heading', { name: 'We found your Past marathon.' })).toBeInTheDocument()
    expect(saved).toBeNull()
  })

  it('starts recovery from the saved historical race without re-entering its name, date or distance', async () => {
    const saved = { ...past, raceResult: result }
    const started = recovery({ planId: past.planId, eventName: past.raceName, raceDate: result.raceDate, distanceKm: result.distanceKm! })
    vi.spyOn(api.me.journey, 'get').mockResolvedValueOnce(journeyOf([saved])).mockResolvedValue(journeyOf([saved], { recovery: started }))
    vi.spyOn(api.me.journey, 'chapter').mockResolvedValue(saved)
    vi.spyOn(api.me, 'activities').mockResolvedValue([])
    const start = vi.spyOn(api.me.journey, 'startRecovery').mockResolvedValue(started)
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'View chapter' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Replay race celebration' }))
    expect(await screen.findByRole('dialog', { name: 'RACE FINISHED.' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Plan recovery from this race' }))
    expect(screen.queryByRole('textbox', { name: 'Distance (km)' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start my recovery' }))
    expect(start).toHaveBeenCalledWith('test-token', expect.objectContaining({ planId: past.planId, eventName: past.raceName, raceDate: result.raceDate, distanceKm: result.distanceKm }))
    expect(await screen.findByRole('heading', { name: 'Your recovery days are done' })).toBeInTheDocument()
  })

  it('keeps chapter history and manual entry available when recordings fail, with a retry', async () => {
    vi.spyOn(api.me.journey, 'get').mockResolvedValue(journeyOf([past]))
    vi.spyOn(api.me.journey, 'chapter').mockResolvedValue(past)
    vi.spyOn(api.me, 'activities').mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue([run])
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'View chapter' }))
    expect(await screen.findByText(/Your recorded runs couldn’t load/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: past.raceName })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I finished' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry recorded runs' }))
    expect(await screen.findByRole('heading', { name: 'We found your Past marathon.' })).toBeInTheDocument()
  })

  it('drops a late chapter response after opening another chapter', async () => {
    const other = chapter({ planId: 'other-plan', raceName: 'Another race' })
    vi.spyOn(api.me.journey, 'get').mockResolvedValue(journeyOf([past, other]))
    let finish!: (value: PlanChapter) => void
    vi.spyOn(api.me.journey, 'chapter').mockImplementation(async (_token, id) => id === past.planId ? new Promise(resolve => { finish = resolve }) : other)
    vi.spyOn(api.me, 'activities').mockResolvedValue([])
    const user = userEvent.setup()
    show()
    await user.click((await screen.findAllByRole('button', { name: 'View chapter' }))[0]!)
    await user.click(screen.getAllByRole('button', { name: 'View chapter' })[1]!)
    expect(await screen.findByRole('heading', { name: other.raceName })).toBeInTheDocument()
    await act(async () => finish(past))
    await waitFor(() => expect(screen.queryByRole('heading', { name: past.raceName })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: other.raceName })).toBeInTheDocument()
  })
})
