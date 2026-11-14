import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Activity, ActivitySummary } from '../../lib/types'
import { chapter, raceResult } from './journey-fixtures'
import { RaceResultForm } from './RaceResultForm'

const marathon = chapter({ raceName: 'Mandela Marathon', raceDate: '2026-10-18', distanceKm: 42.195 })
const run = {
  id: '33333333-3333-4333-8333-333333333333',
  startedAt: '2026-10-18T05:30:00Z',
  localDate: '2026-10-18',
  kind: 'Run',
  distanceKm: 42.35,
  movingSeconds: 15920,
  paceSecondsPerKm: 376,
  plannedTitle: null,
  plannedSessionType: null,
  pace: null,
  averageHeartRate: null,
  source: { kind: 'Strava', viewUrl: 'https://www.strava.com/activities/567', recordedOnGarmin: false, cachedUntil: null },
} satisfies ActivitySummary

const detail = { ...run, elapsedSeconds: 16812 } as unknown as Activity

describe('Race result from an existing Strava recording', () => {
  it('finds the marathon, uses recorded elapsed time and saves only after confirmation', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => raceResult({ raceDate: marathon.raceDate!, distanceKm: run.distanceKm, finishTime: '04:40:12', activityId: run.id }))
    const onLoadActivity = vi.fn(async () => detail)
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[run]} onLoadActivity={onLoadActivity} onSave={onSave} onDelete={vi.fn(async () => {})} />)
    expect(screen.getByRole('heading', { name: 'We found your Mandela Marathon.' })).toBeInTheDocument()
    expect(screen.getByText(/No need to type the result again/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      raceDate: '2026-10-18', outcome: 'Finished', finishTime: '04:40:12', distanceKm: 42.35, activityId: run.id,
    })))
    expect(onLoadActivity).toHaveBeenCalledWith(run.id)
    expect(await screen.findByRole('heading', { name: 'Finished in 4:40:12' })).toBeInTheDocument()
  })

  it('offers a prefilled form to check recorded time against chip time', async () => {
    const user = userEvent.setup()
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[run]} onLoadActivity={async () => detail} onSave={vi.fn()} onDelete={vi.fn(async () => {})} />)
    await user.click(screen.getByRole('button', { name: 'Review details' }))
    expect(await screen.findByRole('textbox', { name: 'Hours' })).toHaveValue('4')
    expect(screen.getByRole('textbox', { name: 'Minutes' })).toHaveValue('40')
    expect(screen.getByRole('textbox', { name: 'Seconds' })).toHaveValue('12')
    expect(screen.getByText(/official chip time/)).toBeInTheDocument()
  })

  it('does not save a result when the full recording cannot be verified', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[run]} onLoadActivity={async () => ({ ...detail, id: 'different' })} onSave={onSave} onDelete={vi.fn(async () => {})} />)
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be verified/)
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'I finished' })).toBeInTheDocument()
  })
})
