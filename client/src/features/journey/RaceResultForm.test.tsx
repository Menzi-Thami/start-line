import { act, render, screen, waitFor } from '@testing-library/react'
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

  it.each(['Finished', 'DidNotFinish'] as const)('loads known metrics when manually linking a run without changing %s or the note', async outcome => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => raceResult({ outcome }))
    const recording = { ...run, distanceKm: 20 }
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[recording]} onLoadActivity={async () => ({ ...detail, distanceKm: 20 })} onSave={onSave} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: outcome === 'Finished' ? 'I finished' : 'I didn’t finish' }))
    await user.type(screen.getByRole('textbox', { name: 'A note for yourself (optional)' }), 'My race note')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Link a recorded run (optional)' }), run.id)
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Distance.*km/ })).toHaveValue('20'))
    expect(onSave).not.toHaveBeenCalled()
    if (outcome === 'Finished') expect(screen.getByRole('textbox', { name: 'Minutes' })).toHaveValue('40')
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ outcome, activityId: run.id, distanceKm: 20,
      finishTime: outcome === 'Finished' ? '04:40:12' : null, note: 'My race note' }))
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

  it.each<Partial<Activity>>([
    { localDate: '2026-10-17' }, { kind: 'Other' }, { distanceKm: 5 },
    { elapsedSeconds: NaN }, { elapsedSeconds: 0 }, { elapsedSeconds: 49 * 3600 },
    { elapsedSeconds: run.movingSeconds - 1 }, { movingSeconds: NaN },
  ])('refuses invalid or mismatched recording details: %j', async change => {
    const onSave = vi.fn()
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[run]} onLoadActivity={async () => ({ ...detail, ...change })} onSave={onSave} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be verified')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('requires an explicit choice even for near-identical Strava and upload recordings', async () => {
    const user = userEvent.setup()
    const upload = { ...run, id: 'upload-id', source: { ...run.source, kind: 'Upload' as const, viewUrl: null } }
    const onLoadActivity = vi.fn(async () => ({ ...detail, ...upload }))
    const onSave = vi.fn(async () => raceResult())
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[upload, run]} onLoadActivity={onLoadActivity} onSave={onSave} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Confirm my recorded finish' })).toBeDisabled()
    expect(onLoadActivity).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByRole('combobox', { name: /Choose your race recording/ }), upload.id)
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Review details' }))
    expect(await screen.findByRole('textbox', { name: 'Minutes' })).toHaveValue('40')
    await user.clear(screen.getByRole('textbox', { name: 'Minutes' }))
    await user.type(screen.getByRole('textbox', { name: 'Minutes' }), '39')
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ activityId: upload.id, finishTime: '04:39:12' }))
  })

  it('offers manual entry when a recording expired or became unavailable', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[run]} onLoadActivity={async () => { throw new Error('This recording is no longer available.') }} onSave={onSave} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available')
    expect(onSave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'I finished' }))
    expect(screen.getByRole('textbox', { name: 'Hours' })).toHaveValue('')
  })

  it('retains the verified result after a failed save and retries without loading or submitting twice', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValueOnce(new Error('Save failed. Try again.')).mockResolvedValue(raceResult({ finishTime: '04:40:12' }))
    const onLoadActivity = vi.fn(async () => detail)
    render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[run]} onLoadActivity={onLoadActivity} onSave={onSave} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
    expect(screen.getByRole('textbox', { name: 'Minutes' })).toHaveValue('40')
    await user.dblClick(screen.getByRole('button', { name: 'Save race result' }))
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onLoadActivity).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[1]?.[0]).toMatchObject({ activityId: run.id, distanceKm: 42.35, finishTime: '04:40:12' })
  })

  it('does not persist a late recording response after leaving the chapter', async () => {
    let resolve!: (activity: Activity) => void
    const onSave = vi.fn()
    const { unmount } = render(<RaceResultForm chapter={marathon} today="2026-11-14" units="km" runs={[run]} onLoadActivity={() => new Promise(done => { resolve = done })} onSave={onSave} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm my recorded finish' }))
    expect(screen.getByRole('button', { name: 'I finished' })).toBeDisabled()
    unmount()
    await act(async () => resolve(detail))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('holds the version the runner edited when a newer server result arrives', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => { throw new Error('Your result changed on another device. Load it again before saving.') })
    const props = { chapter: { ...marathon, raceResult: raceResult({ version: 'original', raceDate: marathon.raceDate! }) }, today: '2026-11-14', units: 'km' as const, onSave, onDelete: vi.fn() }
    const { rerender } = render(<RaceResultForm {...props} />)
    await user.click(screen.getByRole('button', { name: 'Edit result' }))
    await user.clear(screen.getByRole('textbox', { name: 'Minutes' }))
    await user.type(screen.getByRole('textbox', { name: 'Minutes' }), '50')
    rerender(<RaceResultForm {...props} chapter={{ ...props.chapter, raceResult: raceResult({ version: 'other-device', finishTime: '01:49:00' }) }} />)
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 'original', finishTime: '01:50:10' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed on another device')
    expect(screen.getByRole('textbox', { name: 'Minutes' })).toHaveValue('50')
  })

  it.each([
    { today: '2026-10-17', distanceKm: run.distanceKm },
    { today: '2026-11-14', distanceKm: 5 },
  ])('never treats a future race or no match as a finish (%j)', ({ today, distanceKm }) => {
    const onSave = vi.fn()
    render(<RaceResultForm chapter={marathon} today={today} units="km" runs={[{ ...run, distanceKm }]} onLoadActivity={vi.fn()} onSave={onSave} onDelete={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: /We found your/ })).not.toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})
