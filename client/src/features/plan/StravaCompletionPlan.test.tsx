import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, CheckIn, CheckInRequest, Session, SyncedCompletion, TrainingPlan } from '../../lib/types'
import plan5k from '../../test/fixtures/plan-5k.json'
import { closePlanDay, openWeekDay } from '../../test/user-navigation'
import type { SessionCoach } from '../coaching/useCheckIns'
import { PlanView } from './PlanView'

// Week 1 of the 5K plan: strength Monday 12, hills Tuesday 13, easy + strides Thursday 15, easy Saturday 17, long run Sunday 18.
const plan = plan5k as TrainingPlan

const stravaRun: ActivitySummary = {
  id: 'strava-hills', startedAt: '2026-10-13T05:00:00Z', localDate: '2026-10-13', kind: 'Run', distanceKm: 6.4, movingSeconds: 2300,
  paceSecondsPerKm: 359, plannedTitle: 'Hill repeats', plannedSessionType: 'Hills', pace: null, averageHeartRate: null,
  source: { kind: 'Strava', viewUrl: 'https://www.strava.com/activities/1', recordedOnGarmin: true, cachedUntil: '2027-01-01T00:00:00Z' },
} as ActivitySummary

const hills: SyncedCompletion = {
  date: '2026-10-13', sessionType: 'Hills', activityId: 'strava-hills', state: 'Completed', measure: 'Distance', plannedKm: 5.5, actualKm: 6.4,
  plannedSeconds: 0, actualSeconds: 2300, feedback: 'Longer', cachedUntil: '2027-01-01T00:00:00Z',
}

/** A coach whose check-ins live in memory, as the real hook keeps them, with the API's Strava completions. */
function coachWith(completions: SyncedCompletion[], initial: CheckIn[] = []) {
  const entries = new Map(initial.map((c) => [`${c.date}|${c.sessionType}`, c]))
  const saves: CheckInRequest[] = []
  const coach = (): SessionCoach => ({
    today: '2026-10-18',
    units: 'km',
    entries: [...entries.values()],
    get: (s: Session) => entries.get(`${s.date}|${s.type}`),
    synced: (s) => completions.find((c) => c.date === s.date && c.sessionType === s.type),
    save: async (s, answers) => {
      saves.push(answers)
      entries.set(`${s.date}|${s.type}`, { date: s.date, sessionType: s.type, status: answers.status, effort: answers.effort ?? null, pain: answers.pain ?? 'None', painArea: answers.painArea ?? null, note: answers.note ?? null, distanceKm: answers.distanceKm ?? null, duration: answers.duration ?? null, activityId: answers.activityId ?? null, actualSessionType: answers.actualSessionType ?? null, updatedAt: '2026-10-18T08:00:00Z', distanceUnreported: answers.distanceUnreported, isAdditional: false } as CheckIn)
      rerender()
    },
    remove: vi.fn(),
  })
  let rerender = () => {}
  const view = () => <PlanView plan={plan} units="km" shareUrl="https://taperday.run/?x" today="2026-10-18" runs={[stravaRun]} coach={coach()} />
  const rendered = render(view())
  rerender = () => rendered.rerender(view())
  return { saves, entries }
}

describe('a plan session completed via Strava', () => {
  it('shows done on the week and the calendar, with provenance and the longer-run words', async () => {
    coachWith([hills])

    expect(await screen.findByRole('button', { name: /^Tuesday 13 October 2026:.*Hill repeats.*Recorded via Strava/ })).toBeInTheDocument()
    const day = await openWeekDay('2026-10-13')
    expect(within(day).getByText('Activity recorded via Strava · provisional', { selector: '.day-summary-status' })).toBeInTheDocument()
    expect(within(day).getByText(/You covered 6\.4 km against 5\.5 km planned\. More isn't always better — try to follow your planned distance next time/)).toBeInTheDocument()

    await closePlanDay()
    await userEvent.click(screen.getByRole('tab', { name: 'Calendar' }))
    expect(screen.getByRole('button', { name: /^13 [A-Za-z]+: Hill repeats, recorded via strava/ })).toBeInTheDocument()
    // Two ways to browse weeks: This week and Calendar. No third, full-schedule list.
    expect(screen.queryByText('Full training schedule', { selector: 'summary' })).not.toBeInTheDocument()
  })

  it('keeps the tick with one tap, without a rating, which makes it the runner’s own', async () => {
    const { saves } = coachWith([hills])
    const day = await openWeekDay('2026-10-13')

    expect(within(day).queryByRole('button', { name: 'Keep this tick' })).not.toBeInTheDocument()
    await userEvent.click(within(day).getByRole('button', { name: 'Tick without rating' }))

    expect(saves).toEqual([{ status: 'Done', effort: null, distanceUnreported: false }])
    await closePlanDay()
    expect(await screen.findByRole('button', { name: /^Tuesday 13 October 2026:.*Hill repeats.*Completed/ })).toBeInTheDocument()
    expect(screen.queryByText('Activity recorded via Strava · provisional', { selector: '.day-summary-status' })).not.toBeInTheDocument()
  })

  // R02: two deliberate taps (an effort, then Save as planned) keep only the runner's own answer: no Strava distance, time or id.
  it('rates a Strava-completed run in two taps and saves only the runner’s own answer', async () => {
    const { saves } = coachWith([hills])
    const day = await openWeekDay('2026-10-13')

    expect(within(day).getByText('Completed via Strava')).toBeInTheDocument()
    const save = within(day).getByRole('button', { name: 'Save as planned' })
    expect(save).toBeDisabled()
    expect(within(day).getByText('Expected for hill repeats: 7–8/10.')).toBeInTheDocument()
    await userEvent.click(within(day).getByRole('radio', { name: '3, Easy, chatty' }))
    await userEvent.click(save)

    expect(saves).toEqual([{ status: 'Done', effort: 3, pain: 'None', painArea: null, distanceKm: null, duration: null, activityId: null, note: null, actualSessionType: null, distanceUnreported: false }])
    expect(JSON.stringify(saves)).not.toContain('strava-hills')
    expect(JSON.stringify(saves)).not.toContain('6.4')
    expect(within(day).getByText('Rated 3/10 · As planned')).toBeInTheDocument()
    expect(within(day).getByText('Rated 3/10 · As planned').closest('p')).toHaveFocus()
    expect(within(day).getByRole('button', { name: 'Edit feedback for Hill repeats' })).toBeInTheDocument()
  })

  // R03: editing changes the same check-in; there is never a second one.
  it('edits the rating in place', async () => {
    const { saves, entries } = coachWith([hills])
    const day = await openWeekDay('2026-10-13')
    await userEvent.click(within(day).getByRole('radio', { name: '3, Easy, chatty' }))
    await userEvent.click(within(day).getByRole('button', { name: 'Save as planned' }))

    await userEvent.click(within(day).getByRole('button', { name: 'Edit feedback for Hill repeats' }))
    expect(within(day).getByRole('radio', { name: '3, Easy, chatty' })).toBeChecked()
    await userEvent.click(within(day).getByRole('radio', { name: '8, Very hard' }))
    await userEvent.click(within(day).getByRole('button', { name: 'Save as planned' }))

    expect(saves.map(s => s.effort)).toEqual([3, 8])
    expect(entries.size).toBe(1)
    expect(within(day).getByText('Rated 8/10 · As planned')).toBeInTheDocument()
  })

  // R04: cut short needs an effort, and the imported 6.4 km is never copied into the answer.
  it('saves a cut-short run with its effort and none of the imported figures', async () => {
    const { saves } = coachWith([hills])
    const day = await openWeekDay('2026-10-13')
    await userEvent.click(within(day).getByRole('button', { name: 'Did something different?' }))
    await userEvent.click(within(day).getByRole('radio', { name: 'Cut short' }))
    expect(within(day).getByRole('button', { name: 'Save as cut short' })).toBeDisabled()
    await userEvent.click(within(day).getByRole('radio', { name: '8, Very hard' }))
    await userEvent.click(within(day).getByRole('button', { name: 'Save as cut short' }))

    expect(saves).toEqual([expect.objectContaining({ status: 'CutShort', effort: 8, distanceKm: null, duration: null, activityId: null })])
    expect(within(day).getByText('Rated 8/10 · Cut short')).toBeInTheDocument()
  })

  it('saves a skip with no effort, and the run stays beside it as a conflict', async () => {
    const { saves } = coachWith([hills])
    const day = await openWeekDay('2026-10-13')
    await userEvent.click(within(day).getByRole('button', { name: 'Did something different?' }))
    await userEvent.click(within(day).getByRole('radio', { name: 'Skipped' }))
    expect(within(day).queryByRole('group', { name: 'How hard did it feel?' })).not.toBeInTheDocument()
    await userEvent.click(within(day).getByRole('button', { name: 'Save as skipped' }))

    expect(saves).toEqual([expect.objectContaining({ status: 'Skipped', effort: null, distanceKm: null, activityId: null })])
  })

  it('leaves a skipped session skipped and shows the run beside it', async () => {
    const skipped = { date: '2026-10-13', sessionType: 'Hills', status: 'Skipped', effort: null, pain: 'None', updatedAt: '2026-10-13T20:00:00Z', distanceUnreported: false, isAdditional: false } as CheckIn
    coachWith([{ ...hills, state: 'Conflict' }], [skipped])

    const date = await screen.findByRole('button', { name: /^Tuesday 13 October 2026:.*Hill repeats/ })
    expect(date).not.toHaveAccessibleName(/Completed|, done/)
    const day = await openWeekDay('2026-10-13')
    expect(within(day).getByText('Skipped', { selector: '.day-summary-status' })).toBeInTheDocument()
    expect(within(day).getByText('You marked this skipped.')).toBeInTheDocument()
    expect(within(day).getByRole('button', { name: 'I ran it: mark as done' })).toBeInTheDocument()
  })

  it('without a completion from the API, a synced run alone completes nothing', async () => {
    coachWith([])

    expect(await screen.findByRole('button', { name: /^Tuesday 13 October 2026:.*Hill repeats.*Activity recorded/ })).toBeInTheDocument()
    const day = await openWeekDay('2026-10-13')
    expect(within(day).queryByText('Activity recorded via Strava · provisional')).not.toBeInTheDocument()
  })
})
