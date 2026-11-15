import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Activity, ActivitySummary, TrainingPlan } from '../../lib/types'
import { chapter, journeyOf, PLAN_ID, raceResult, recap } from './journey-fixtures'
import { JourneyPanel } from './JourneyPanel'
import type { RaceResult } from './types'
import { useJourney } from './useJourney'

const auth = { ...accountsOff, enabled: true, account: { name: 'Synthetic runner', email: 'race@example.test' }, getToken: async () => 'test-token' }
const plan = { race: { name: 'Hoka Half', date: '2026-11-14' }, startDate: '2026-08-24', weeks: [] } as unknown as TrainingPlan
const run = { id: 'recording', localDate: '2026-11-14', startedAt: '2026-11-14T05:30:00Z', kind: 'Run', distanceKm: 20.3, movingSeconds: 7200,
  source: { kind: 'Strava', viewUrl: null, cachedUntil: null, recordedOnGarmin: true } } as ActivitySummary
const result = raceResult({ raceDate: run.localDate, finishTime: '02:06:15', distanceKm: 20.3, activityId: run.id, timeKind: 'RecordedElapsed' })
const award = { id: 'race-award', kind: 'RaceFinished' as const, planId: PLAN_ID, earnedOn: run.localDate, awardedAt: '2026-11-15T10:00:00Z', celebratedAt: null }
const local = { total: 10, completed: 4, provisional: 0, distanceKm: 32, weeks: 4, allConfirmed: false, trainingEnded: true, racePassed: true, earned: false, visible: true }

function Screen({ recordings = [run] }: { recordings?: ActivitySummary[] }) {
  const journey = useJourney(true)
  return <JourneyPanel plan={plan} today="2026-11-15" units="km" planId={PLAN_ID} journey={journey} local={local}
    runs={recordings} onLoadActivity={async () => ({ ...run, elapsedSeconds: 7575 }) as unknown as Activity} runDays={['Tuesday', 'Thursday', 'Saturday']} />
}
const show = (recordings?: ActivitySummary[]) => render(<AuthContext.Provider value={auth}><Screen recordings={recordings} /></AuthContext.Provider>)
afterEach(() => vi.restoreAllMocks())

describe('Review my race handoff', () => {
  it('automatically fills → confirms once → celebrates → focuses the actual saved race → reloads after cache expiry', async () => {
    let saved: RaceResult | null = null
    let celebrated = false
    vi.spyOn(api.me.journey, 'get').mockImplementation(async () => journeyOf([chapter({ raceName: 'Hoka Half', raceDate: run.localDate,
      training: recap({ scheduledRuns: 10, confirmedRuns: 4, allConfirmed: false, raceDatePassed: true }),
      raceResult: saved, achievements: saved ? [{ ...award, celebratedAt: celebrated ? '2026-11-15T10:01:00Z' : null }] : [] })]))
    const save = vi.spyOn(api.me.journey, 'saveRaceResult').mockImplementation(async () => { saved = result; return result })
    vi.spyOn(api.me.journey, 'celebrated').mockImplementation(async () => { celebrated = true })
    const user = userEvent.setup()
    const view = show()
    expect(await screen.findByText('2:06:15')).toBeVisible()
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    const film = await screen.findByRole('dialog', { name: 'RACE FINISHED.' })
    expect(within(film).getByText('2:06:15')).toBeVisible()
    await user.click(within(film).getByRole('button', { name: 'Review my race' }))
    await waitFor(() => expect(document.querySelector('.journey-race-summary')).toHaveFocus())
    expect(screen.getByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
    expect(screen.getByText('20.3 km')).toBeVisible()
    expect(screen.getByText('Recording elapsed time')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Share my race' })).toBeVisible()
    expect(screen.queryByText('Other race outcomes')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('THE WORK BEHIND THE FINISH')).not.toBeVisible()
    expect(screen.queryByText('Want a gentle recovery plan?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start recovery plan' })).toBeVisible()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('test-token', PLAN_ID, expect.objectContaining({ finishTime: '02:06:15', distanceKm: 20.3, activityId: run.id, timeKind: 'RecordedElapsed' }))
    view.unmount()
    show([])
    expect(await screen.findByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm my recorded finish' })).not.toBeInTheDocument()
  })

  it('keeps a successful confirmation visible and reviewable when the subsequent refresh fails', async () => {
    vi.spyOn(api.me.journey, 'get').mockResolvedValueOnce(journeyOf([chapter({ raceName: 'Hoka Half', raceDate: run.localDate, training: recap({ raceDatePassed: true }) })]))
      .mockRejectedValue(new Error('Refresh unavailable'))
    vi.spyOn(api.me.journey, 'saveRaceResult').mockResolvedValue(result)
    show()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm my recorded finish' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    expect(await screen.findByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
    expect(screen.getByText(/Showing your saved journey/)).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I finished' })).not.toBeInTheDocument()
  })
})
