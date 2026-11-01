import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, CheckIn, CheckInRequest, Session, SyncedCompletion, TrainingPlan } from '../../lib/types'
import plan5k from '../../test/fixtures/plan-5k.json'
import { openDisclosure, openWeekDay } from '../../test/user-navigation'
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
      entries.set(`${s.date}|${s.type}`, { date: s.date, sessionType: s.type, status: answers.status, effort: answers.effort ?? null, pain: 'None', updatedAt: '2026-10-18T08:00:00Z', distanceUnreported: false, isAdditional: false } as CheckIn)
      rerender()
    },
    remove: vi.fn(),
  })
  let rerender = () => {}
  const view = () => <PlanView plan={plan} units="km" onUnitsChange={() => {}} shareUrl="https://taperday.run/?x" today="2026-10-18" runs={[stravaRun]} coach={coach()} />
  const rendered = render(view())
  rerender = () => rendered.rerender(view())
  return { saves }
}

describe('a plan session completed via Strava', () => {
  it('shows done on the week, the calendar and the week’s count, with provenance and the longer-run words', async () => {
    coachWith([hills])

    expect(await screen.findByRole('button', { name: /^Tuesday 13 October 2026: Hill repeats, done/ })).toBeInTheDocument()
    const day = await openWeekDay('2026-10-13')
    expect(within(day).getByText('Completed via Strava', { selector: '.day-summary-status' })).toBeInTheDocument()
    expect(within(day).getByText(/You covered 6\.4 km against 5\.5 km planned\. More isn't always better — try to follow your planned distance next time/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Calendar' }))
    expect(screen.getByRole('button', { name: /^13 [A-Za-z]+: Hill repeats, done/ })).toBeInTheDocument()

    const schedule = await openDisclosure('Full training schedule')
    expect(within(schedule).getByText(/· 1 of \d+ done/)).toBeInTheDocument()
  })

  it('keeps the tick with one tap, which makes it the runner’s own', async () => {
    const { saves } = coachWith([hills])
    const day = await openWeekDay('2026-10-13')

    await userEvent.click(within(day).getByRole('button', { name: 'Keep this tick' }))

    expect(saves).toEqual([{ status: 'Done', effort: null, distanceUnreported: false }])
    expect(await screen.findByRole('button', { name: /^Tuesday 13 October 2026: Hill repeats, done/ })).toBeInTheDocument()
    expect(screen.queryByText('Completed via Strava', { selector: '.day-summary-status' })).not.toBeInTheDocument()
  })

  it('leaves a skipped session skipped and shows the run beside it', async () => {
    const skipped = { date: '2026-10-13', sessionType: 'Hills', status: 'Skipped', effort: null, pain: 'None', updatedAt: '2026-10-13T20:00:00Z', distanceUnreported: false, isAdditional: false } as CheckIn
    coachWith([{ ...hills, state: 'Conflict' }], [skipped])

    expect(await screen.findByRole('button', { name: /^Tuesday 13 October 2026: Hill repeats(?!, done)/ })).toBeInTheDocument()
    const day = await openWeekDay('2026-10-13')
    expect(within(day).getByText('Skipped', { selector: '.day-summary-status' })).toBeInTheDocument()
    expect(within(day).getByText('You marked this skipped.')).toBeInTheDocument()
    expect(within(day).getByRole('button', { name: 'I ran it: mark as done' })).toBeInTheDocument()
  })

  it('without a completion from the API, a synced run alone completes nothing', async () => {
    coachWith([])

    expect(await screen.findByRole('button', { name: /^Tuesday 13 October 2026: Hill repeats, no completion recorded/ })).toBeInTheDocument()
    const day = await openWeekDay('2026-10-13')
    expect(within(day).queryByText('Completed via Strava')).not.toBeInTheDocument()
  })
})
