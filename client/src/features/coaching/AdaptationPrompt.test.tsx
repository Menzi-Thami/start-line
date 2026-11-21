import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/api-client'
import type { CheckIn, RemainingWeekProposal } from '../../lib/types'
import { AdaptationPrompt } from './AdaptationPrompt'
import type { SessionCoach } from './useCheckIns'

const entry = (answers: Partial<CheckIn> = {}): CheckIn => ({
  date: '2026-11-24', sessionType: 'Easy', status: 'Done', effort: 7, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null,
  activityId: null, actualSessionType: null, distanceUnreported: false, isAdditional: false, updatedAt: '2026-11-24T18:00:00Z', ...answers,
}) as CheckIn

const proposal = (token = 'a'.repeat(64)): RemainingWeekProposal => ({
  token,
  summary: 'Two runs this week felt harder than they should. Ease the rest of the week: hard sessions become easy runs, and no kilometres are made up.',
  changes: [{ appliedOn: '2026-11-24', date: '2026-11-26', originalType: 'Tempo', originalTitle: 'Tempo run', originalKm: 8.25, easyKm: 6.25 }],
  proposed: {},
}) as unknown as RemainingWeekProposal

function setup(review: () => Promise<RemainingWeekProposal>, answers: Partial<CheckIn> = {}) {
  const applyRemaining = vi.fn(async () => {})
  const restore = vi.fn(async () => {})
  const reviewRemaining = vi.fn(review)
  const coach: SessionCoach = {
    today: '2026-11-24', units: 'km', get: () => undefined, save: vi.fn(), remove: vi.fn(),
    adjustments: { review: vi.fn(), apply: vi.fn(), reviewRemaining, applyRemaining, life: { preview: vi.fn(), apply: vi.fn(), restore } } as unknown as SessionCoach['adjustments'],
  }
  const rendered = render(<AdaptationPrompt entry={entry(answers)} coach={coach} />)
  return { ...rendered, reviewRemaining, applyRemaining, restore, user: userEvent.setup() }
}

afterEach(() => localStorage.clear())

describe('what the coach makes of a rating', () => {
  it('checks only what the runner reported, and says nothing when no change is suggested', async () => {
    const { reviewRemaining, container } = setup(async () => ({ ...proposal(), changes: [] }), { effort: 3 })
    await vi.waitFor(() => expect(reviewRemaining).toHaveBeenCalledWith(true))
    expect(container).toBeEmptyDOMElement()
  })

  it('notes one run that felt much harder, without changing anything (warning only)', async () => {
    setup(async () => ({ ...proposal(), changes: [] }), { effort: 7 })
    expect(await screen.findByText(/That felt harder than this kind of run should/)).toBeInTheDocument()
  })

  it('offers a suggested easier week to review, applies exactly it, and undoes it (R07)', async () => {
    const { user, applyRemaining, restore } = setup(async () => proposal())
    expect(await screen.findByRole('heading', { name: 'Ease the rest of this week?' })).toBeInTheDocument()
    // One concise card: the reason first, the before/after only on Review change.
    expect(screen.queryByText('Tempo run · 8.25 km', { exact: false })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review change' }))
    expect(screen.getByText('26 Nov: Tempo run · 8.25 km → Easy run · 6.25 km', { exact: false })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply this easier week' }))
    expect(applyRemaining).toHaveBeenCalledWith('a'.repeat(64), true)
    expect(await screen.findByText(/Rest of this week eased/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(restore).toHaveBeenCalledWith(['2026-11-26'])
    expect(await screen.findByText('Back as planned.')).toBeInTheDocument()
  })

  it('remembers Keep plan for that suggestion, so it doesn’t ask again until something changes', async () => {
    const first = setup(async () => proposal())
    await first.user.click(await screen.findByRole('button', { name: 'Keep plan' }))
    expect(screen.getByText('Your plan stays as it is.')).toBeInTheDocument()
    expect(first.applyRemaining).not.toHaveBeenCalled()
    first.unmount()

    const again = setup(async () => proposal(), { effort: 3 })
    await vi.waitFor(() => expect(again.reviewRemaining).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Ease the rest of this week?' })).not.toBeInTheDocument()

    again.unmount()
    setup(async () => proposal('b'.repeat(64)))
    expect(await screen.findByRole('heading', { name: 'Ease the rest of this week?' })).toBeInTheDocument()
  })

  it('checks again when the suggestion went stale (409) instead of applying something old', async () => {
    let calls = 0
    const { user, applyRemaining, reviewRemaining } = setup(async () => proposal(++calls === 1 ? 'a'.repeat(64) : 'c'.repeat(64)))
    applyRemaining.mockRejectedValueOnce(new ApiError('Your running or plan has changed.', 409))
    await user.click(await screen.findByRole('button', { name: 'Review change' }))
    await user.click(screen.getByRole('button', { name: 'Apply this easier week' }))
    await vi.waitFor(() => expect(reviewRemaining).toHaveBeenCalledTimes(2))
    // Still reviewing: the fresh preview is shown, ready to apply.
    expect(await screen.findByRole('button', { name: 'Apply this easier week' })).toBeEnabled()
  })

  it('stays quiet when the check can’t run, and the rating still stands', async () => {
    const { container, reviewRemaining } = setup(async () => { throw new Error('offline') }, { effort: 3 })
    await vi.waitFor(() => expect(reviewRemaining).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
