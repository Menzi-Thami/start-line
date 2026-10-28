import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api-client'
import type { ActivitySummary, CheckIn, Session } from '../../lib/types'
import { planFixture } from '../../test/server'
import { CheckInCard } from './CheckInCard'
import type { SessionCoach } from './useCheckIns'

// Tuesday 13 October's hill repeats, checked in on the Wednesday.
const hills = planFixture.weeks[0]!.sessions.find((s) => s.type === 'Hills') as Session

function setup({ today = '2026-10-14', units = 'km' as const, existing, completion = false, runs = [] }: { today?: string; units?: 'km' | 'mi'; existing?: CheckIn; completion?: boolean; runs?: ActivitySummary[] } = {}) {
  const save = vi.fn<SessionCoach['save']>().mockResolvedValue(undefined)
  const remove = vi.fn<SessionCoach['remove']>().mockResolvedValue(undefined)
  const onDone = vi.fn()
  const coach: SessionCoach = { today, units, get: () => existing, save, remove }
  render(<CheckInCard session={hills} coach={coach} onDone={onDone} completion={completion} runs={runs} />)
  return { user: userEvent.setup(), save, remove, onDone }
}

const saveButton = () => screen.getByRole('button', { name: 'Save check-in' })

describe('checking in on a run', () => {
  it('waits until the run’s day has come', () => {
    setup({ today: '2026-10-12' })

    expect(screen.queryByRole('button', { name: 'How did it go?' })).not.toBeInTheDocument()
  })

  it('asks how hard it felt, says how it should feel, and ticks the run off', async () => {
    const { user, save, onDone } = setup()
    await user.click(screen.getByRole('button', { name: 'How did it go?' }))

    expect(screen.getByText('A run like this usually feels about 7–8 out of 10.')).toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
    await user.click(screen.getByRole('radio', { name: '6, Working' }))
    await user.click(saveButton())

    expect(save).toHaveBeenCalledWith(hills, {
      status: 'Done',
      effort: 6,
      pain: 'None',
      painArea: null,
      distanceKm: null,
      duration: null,
      note: null, actualSessionType: null, distanceUnreported: false, activityId: null,
    })
    expect(onDone).toHaveBeenCalledWith(true)
  })

  it('needs no effort for a skipped run, and unticks it', async () => {
    const { user, save, onDone } = setup()
    await user.click(screen.getByRole('button', { name: 'How did it go?' }))

    await user.click(screen.getByRole('radio', { name: 'Skipped' }))
    expect(screen.queryByRole('radio', { name: '6, Working' })).not.toBeInTheDocument()
    await user.click(saveButton())

    expect(save).toHaveBeenCalledWith(hills, expect.objectContaining({ status: 'Skipped', effort: null }))
    expect(onDone).toHaveBeenCalledWith(false)
  })

  it('asks where it hurt, and says to rest when pain changed the run', async () => {
    const { user, save } = setup()
    await user.click(screen.getByRole('button', { name: 'How did it go?' }))
    await user.click(screen.getByRole('radio', { name: '8, Very hard' }))

    await user.click(screen.getByRole('radio', { name: 'It changed how I ran' }))
    expect(screen.getByText(/a reason to rest/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Where?'), 'Calf')
    await user.click(saveButton())

    expect(save).toHaveBeenCalledWith(hills, expect.objectContaining({ pain: 'ChangedRunning', painArea: 'Calf' }))
  })

  it('takes the distance and time of a run no watch recorded, in the runner’s units', async () => {
    const { user, save } = setup({ units: 'mi' })
    await user.click(screen.getByRole('button', { name: 'How did it go?' }))
    await user.click(screen.getByRole('radio', { name: '5, Steady' }))

    await user.type(screen.getByLabelText('Distance (mi)'), '5')
    await user.type(screen.getByLabelText('Minutes'), '42')
    await user.type(screen.getByLabelText('Seconds'), '10')
    await user.click(saveButton())

    expect(save).toHaveBeenCalledWith(hills, expect.objectContaining({ distanceKm: 8.05, duration: '00:42:10' }))
  })

  it('shows a check-in already made, and can change it', async () => {
    const existing: CheckIn = {
      date: hills.date,
      sessionType: 'Hills',
      status: 'CutShort', distanceUnreported: false, isAdditional: false,
      effort: 9,
      pain: 'Niggle',
      painArea: 'Knee',
      distanceKm: null,
      duration: null,
      note: null,
      updatedAt: '2026-10-13T18:00:00Z',
    }
    const { user } = setup({ existing })

    expect(screen.getByText('Cut short · felt 9/10, near my limit · a niggle (knee)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change how Hill repeats went' }))

    expect(screen.getByRole('radio', { name: 'Cut short' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Remove check-in' })).toBeInTheDocument()
  })

  it('says why a check-in didn’t save', async () => {
    const { user, save } = setup()
    save.mockRejectedValueOnce(new ApiError('Conflict', 409, {}, 'plan_archived'))
    await user.click(screen.getByRole('button', { name: 'How did it go?' }))
    await user.click(screen.getByRole('radio', { name: '4, Comfortable' }))

    await user.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Conflict')
  })
  it('opens quick logging from Complete without saving until confirmed, and accepts time alone', async () => {
    const { user, save, onDone } = setup({ completion: true })
    await user.click(screen.getByRole('checkbox', { name: 'Complete' }))
    expect(save).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Minutes'), '42')
    await user.type(screen.getByLabelText('Seconds'), '10')
    await user.click(saveButton())
    expect(save).toHaveBeenCalledWith(hills, expect.objectContaining({ duration: '00:42:10', distanceKm: null, distanceUnreported: true, effort: null }))
    expect(onDone).toHaveBeenCalledWith(true)
  })

  it('can complete without inventing a finish time', async () => {
    const { user, save } = setup({ completion: true })
    await user.click(screen.getByRole('checkbox', { name: 'Complete' }))
    await user.click(screen.getByRole('button', { name: 'Complete without details' }))
    expect(save).toHaveBeenCalledWith(hills, { status: 'Done', effort: null, distanceUnreported: false })
  })

  it('records an easy long run while preserving the planned session key', async () => {
    const { user, save } = setup()
    await user.click(screen.getByRole('button', { name: 'I ran something different' }))
    await user.selectOptions(screen.getByLabelText('What did you run?'), 'LongRun')
    await user.type(screen.getByLabelText('Distance (km)'), '10')
    await user.type(screen.getByLabelText('Hours'), '1')
    await user.click(saveButton())
    expect(save).toHaveBeenCalledWith(hills, expect.objectContaining({ actualSessionType: 'LongRun', distanceKm: 10, duration: '01:00:00' }))
  })

  it('links a same-day Strava run without copying its metrics into the check-in', async () => {
    const runs = [{ id: 'strava-10', localDate: hills.date, distanceKm: 10, movingSeconds: 3600, source: { kind: 'Strava' } }] as ActivitySummary[]
    const { user, save } = setup({ runs })
    await user.click(screen.getByRole('button', { name: 'I ran something different' }))
    await user.selectOptions(screen.getByLabelText('Run details'), 'strava-10')
    await user.click(saveButton())
    expect(save).toHaveBeenCalledWith(hills, expect.objectContaining({ activityId: 'strava-10', distanceKm: null, duration: null, distanceUnreported: true }))
  })

  it('leaves a failed save open and does not mark it complete', async () => {
    const { user, save, onDone } = setup({ completion: true })
    save.mockRejectedValueOnce(new Error('Try again'))
    await user.click(screen.getByRole('checkbox', { name: 'Complete' }))
    await user.type(screen.getByLabelText('Minutes'), '42')
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again')
    expect(screen.getByLabelText('Minutes')).toHaveValue('42')
    expect(onDone).not.toHaveBeenCalled()
    await user.dblClick(saveButton())
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('does not round away an existing kilometre value when editing in miles', async () => {
    const existing = { date: hills.date, sessionType: hills.type, status: 'Done', effort: 3, pain: 'None', painArea: null, distanceKm: 10, duration: '01:00:00', note: null, updatedAt: '2026-10-13T18:00:00Z', distanceUnreported: false, isAdditional: false } as CheckIn
    const { user, save } = setup({ units: 'mi', existing })
    await user.click(screen.getByRole('button', { name: 'Change how Hill repeats went' }))
    await user.click(saveButton())
    expect(save).toHaveBeenCalledWith(hills, expect.objectContaining({ distanceKm: 10 }))
  })

})
