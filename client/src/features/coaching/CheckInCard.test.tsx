import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api-client'
import type { CheckIn, Session } from '../../lib/types'
import { planFixture } from '../../test/server'
import { CheckInCard } from './CheckInCard'
import type { SessionCoach } from './useCheckIns'

// Tuesday 13 October's hill repeats, checked in on the Wednesday.
const hills = planFixture.weeks[0]!.sessions.find((s) => s.type === 'Hills') as Session

function setup({ today = '2026-10-14', units = 'km' as const, existing }: { today?: string; units?: 'km' | 'mi'; existing?: CheckIn } = {}) {
  const save = vi.fn<SessionCoach['save']>().mockResolvedValue(undefined)
  const remove = vi.fn<SessionCoach['remove']>().mockResolvedValue(undefined)
  const onDone = vi.fn()
  const coach: SessionCoach = { today, units, get: () => existing, save, remove }
  render(<CheckInCard session={hills} coach={coach} onDone={onDone} />)
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
    expect(saveButton()).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: '6, Working' }))
    await user.click(saveButton())

    expect(save).toHaveBeenCalledWith(hills, {
      status: 'Done',
      effort: 6,
      pain: 'None',
      painArea: null,
      distanceKm: null,
      duration: null,
      note: null,
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

    await user.click(screen.getByText('No watch? Add the distance and time'))
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
      status: 'CutShort',
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
})
