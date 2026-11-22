import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CheckIn, CheckInRequest, Session } from '../../lib/types'
import { PostRunRating } from './PostRunRating'
import type { SessionCoach } from './useCheckIns'

const easy: Session = { date: '2026-11-24', type: 'Easy', title: 'Easy run', distanceKm: 7.5, zone: 'Easy', detail: '', purpose: '', exercises: [], steps: [] } as Session

const saved = (answers: Partial<CheckIn>): CheckIn => ({
  date: easy.date, sessionType: easy.type, status: 'Done', effort: null, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null,
  activityId: null, actualSessionType: null, distanceUnreported: false, isAdditional: false, updatedAt: '2026-11-24T18:00:00Z', ...answers,
}) as CheckIn

function setup(options: { entry?: CheckIn; pending?: boolean; save?: (answers: CheckInRequest) => Promise<void>; today?: string } = {}) {
  let entry = options.entry
  const saves: CheckInRequest[] = []
  const coach = (): SessionCoach => ({
    today: options.today ?? '2026-11-24',
    units: 'km',
    get: () => entry,
    pendingFor: () => options.pending ?? false,
    save: async (_session, answers) => {
      saves.push(answers)
      await options.save?.(answers)
      entry = saved({ ...answers } as Partial<CheckIn>)
      rerender()
    },
    remove: vi.fn(),
  })
  const onFullForm = vi.fn()
  const onDismiss = vi.fn()
  const view = () => <PostRunRating session={easy} coach={coach()} quickTick onFullForm={onFullForm} onDismiss={onDismiss} />
  const rendered = render(view())
  const rerender = () => rendered.rerender(view())
  return { saves, onFullForm, onDismiss, user: userEvent.setup() }
}

describe('the two-tap rating', () => {
  it('offers ten labelled effort choices, none chosen, with the expected range for the run', () => {
    setup()
    const scale = screen.getByRole('group', { name: 'How hard did it feel?' })
    const choices = within(scale).getAllByRole('radio')
    expect(choices).toHaveLength(10)
    expect(choices.every(choice => !(choice as HTMLInputElement).checked)).toBe(true)
    expect(within(scale).getByRole('radio', { name: '1, Very easy' })).toBeInTheDocument()
    expect(within(scale).getByRole('radio', { name: '10, All out' })).toBeInTheDocument()
    expect(screen.getByText('Expected for easy run: 2–4/10.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save as planned' })).toBeDisabled()
  })

  it('keeps the plain tick without a rating: Done, no effort invented (R05)', async () => {
    const { saves, user } = setup()
    expect(screen.queryByRole('button', { name: 'Tick without rating' })).not.toBeVisible()
    await user.click(screen.getByText('More details'))
    await user.click(screen.getByRole('button', { name: 'Tick without rating' }))
    expect(saves).toEqual([{ status: 'Done', effort: null, distanceUnreported: false }])
    expect(screen.getByText('Done, not rated')).toBeInTheDocument()
  })

  it('saves nothing when the runner says Not now (R10)', async () => {
    const { saves, onDismiss, user } = setup()
    await user.click(screen.getByRole('radio', { name: '4, Comfortable' }))
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(saves).toEqual([])
  })

  it('keeps pain and a note behind More details, and saves them with the effort', async () => {
    const { saves, user } = setup()
    await user.click(screen.getByRole('radio', { name: '5, Steady' }))
    await user.click(screen.getByText('More details'))
    await user.click(screen.getByRole('radio', { name: 'A niggle' }))
    await user.selectOptions(screen.getByLabelText('Where?'), 'Calf')
    await user.type(screen.getByLabelText(/Anything else/), 'Tight at the end')
    await user.click(screen.getByRole('button', { name: 'Save as planned' }))
    expect(saves).toEqual([expect.objectContaining({ status: 'Done', effort: 5, pain: 'Niggle', painArea: 'Calf', note: 'Tight at the end', distanceKm: null, duration: null, activityId: null })])
    expect(screen.getByText('Rated 5/10 · As planned · a niggle (calf)')).toBeInTheDocument()
  })

  it('sends the runner to the full run log for their own distance and time', async () => {
    const { onFullForm, user } = setup()
    await user.click(screen.getByText('More details'))
    await user.click(screen.getByRole('button', { name: 'Add your own distance and time' }))
    expect(onFullForm).toHaveBeenCalledTimes(1)
  })

  it('says an answer saved offline is waiting to sync (R11)', () => {
    setup({ entry: saved({ effort: 4 }), pending: true })
    expect(screen.getByText('Rated 4/10 · As planned')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved on this device, syncing')
  })

  it('edits an answer that has the runner’s own figures in the full log, so nothing they typed is lost', async () => {
    const { onFullForm, saves, user } = setup({ entry: saved({ effort: 4, distanceKm: 7.2, duration: '00:48:00' }) })
    await user.click(screen.getByRole('button', { name: 'Edit feedback for Easy run' }))
    expect(onFullForm).toHaveBeenCalledTimes(1)
    expect(saves).toEqual([])
  })

  it('keeps the choice and says why when a save fails', async () => {
    const { user } = setup({ save: () => Promise.reject(new Error('That didn’t save. Try again.')) })
    await user.click(screen.getByRole('radio', { name: '3, Easy, chatty' }))
    await user.click(screen.getByRole('button', { name: 'Save as planned' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t save. Try again.')
    expect(screen.getByRole('radio', { name: '3, Easy, chatty' })).toBeChecked()
  })

  it('rechecks current-week coaching advice when an already rated run is reopened after navigation', async () => {
    const reviewRemaining = vi.fn().mockResolvedValue(null)
    const coach: SessionCoach = {
      today: '2026-11-24', units: 'km', get: () => saved({ effort: 8 }),
      save: vi.fn(), remove: vi.fn(),
      adjustments: { reviewRemaining } as unknown as NonNullable<SessionCoach['adjustments']>,
    }
    render(<PostRunRating session={easy} coach={coach} />)
    expect(screen.getByText('Rated 8/10 · As planned')).toBeVisible()
    await waitFor(() => expect(reviewRemaining).toHaveBeenCalledWith(true))
  })

  it('does not recheck an old completed week for a stale adaptation proposal', () => {
    const reviewRemaining = vi.fn().mockResolvedValue(null)
    const coach: SessionCoach = {
      today: '2026-12-01', units: 'km', get: () => saved({ effort: 8 }),
      save: vi.fn(), remove: vi.fn(),
      adjustments: { reviewRemaining } as unknown as NonNullable<SessionCoach['adjustments']>,
    }
    render(<PostRunRating session={easy} coach={coach} />)
    expect(screen.getByText('Rated 8/10 · As planned')).toBeVisible()
    expect(reviewRemaining).not.toHaveBeenCalled()
  })

  it('shows nothing for a run that hasn’t happened yet', () => {
    const { container } = render(<PostRunRating session={easy} coach={{ today: '2026-11-23', units: 'km', get: () => undefined, save: vi.fn(), remove: vi.fn() }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a run logged elsewhere on the day as saved, not an open editor with Cancel', () => {
    let entry: CheckIn | undefined
    const coach = (): SessionCoach => ({ today: '2026-11-24', units: 'km', get: () => entry, save: vi.fn(), remove: vi.fn() })
    const { rerender } = render(<PostRunRating session={easy} coach={coach()} quickTick onDismiss={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument()

    entry = saved({ distanceKm: 7.4 })
    rerender(<PostRunRating session={easy} coach={coach()} quickTick onDismiss={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'How hard did it feel?' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit feedback/ })).toBeInTheDocument()
  })

  it('keeps the editor open when the runner had already picked a score', async () => {
    let entry: CheckIn | undefined
    const coach = (): SessionCoach => ({ today: '2026-11-24', units: 'km', get: () => entry, save: vi.fn(), remove: vi.fn() })
    const user = userEvent.setup()
    const { rerender } = render(<PostRunRating session={easy} coach={coach()} quickTick onDismiss={vi.fn()} />)
    await user.click(screen.getByRole('radio', { name: '3, Easy, chatty' }))

    entry = saved({ distanceKm: 7.4 })
    rerender(<PostRunRating session={easy} coach={coach()} quickTick onDismiss={vi.fn()} />)

    expect(screen.getByRole('radio', { name: '3, Easy, chatty' })).toBeChecked()
  })
})
