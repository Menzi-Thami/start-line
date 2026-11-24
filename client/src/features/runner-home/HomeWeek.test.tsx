import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, CheckIn, TrainingPlan } from '../../lib/types'
import planFixture from '../../test/fixtures/plan-5k.json'
import type { SessionCoach } from '../coaching/useCheckIns'
import { HomeWeek } from './HomeWeek'

const plan = planFixture as unknown as TrainingPlan
const week = plan.weeks[1]!
const session = week.sessions.find(value => value.type !== 'Strength')!
const entry = (overrides: Partial<CheckIn> = {}) => ({ date: session.date, sessionType: session.type, status: 'Done', activityId: null, distanceKm: null, duration: null, ...overrides }) as CheckIn
const coachWith = (saved?: CheckIn) => ({ get: (value: typeof session) => value.date === saved?.date && value.type === saved.sessionType ? saved : undefined, entries: saved ? [saved] : [] }) as unknown as SessionCoach
const recorded = (overrides: Partial<ActivitySummary> = {}) => ({ id: 'exact-recording', localDate: session.date, kind: 'Run', distanceKm: 4.2, movingSeconds: 1500, plannedSessionType: session.type, source: { kind: 'Upload' }, ...overrides }) as ActivitySummary

function show(options: Partial<Parameters<typeof HomeWeek>[0]> = {}) {
  const actions = { onOpenPlan: vi.fn(), onOpenDay: vi.fn(), onOpenRun: vi.fn() }
  render(<HomeWeek plan={plan} week={week} today={session.date} units="km" runs={[]} coach={coachWith()} {...actions} {...options} />)
  return actions
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T08:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('Home weekly workouts', () => {
  it('opens all seven actual dates from a readable running, strength and rest schedule', () => {
    const { onOpenDay } = show()
    const list = screen.getByRole('list', { name: 'This week’s workouts' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    expect(rows[0]).toHaveTextContent('Strength day')
    expect(within(list).getAllByText('Rest day').length).toBeGreaterThan(0)
    const today = list.querySelector<HTMLButtonElement>('[aria-current="date"]')!
    expect(today).toHaveTextContent(session.title)
    expect(today).toHaveTextContent('Today')
    fireEvent.click(today)
    expect(onOpenDay).toHaveBeenCalledWith(session.date)
  })

  it('opens a uniquely matched recording with its actual measurements and no new form', () => {
    const { onOpenRun, onOpenDay } = show({ runs: [recorded()] })
    const row = screen.getByRole('list', { name: 'This week’s workouts' }).querySelector<HTMLButtonElement>('[aria-current="date"]')!
    expect(row).toHaveTextContent('4.2 km')
    expect(row).toHaveTextContent('25:00 moving')
    expect(row).toHaveTextContent('Recorded run')
    fireEvent.click(row)
    expect(onOpenRun).toHaveBeenCalledWith('exact-recording')
    expect(onOpenDay).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps a manual result separate from another upload on that date', () => {
    const { onOpenRun, onOpenDay } = show({ coach: coachWith(entry({ distanceKm: 3.8, duration: '00:24:00' })), runs: [recorded()] })
    const row = screen.getByRole('list', { name: 'This week’s workouts' }).querySelector<HTMLButtonElement>('[aria-current="date"]')!
    expect(row).toHaveTextContent('3.8 km')
    expect(row).not.toHaveTextContent('4.2 km')
    fireEvent.click(row)
    expect(onOpenDay).toHaveBeenCalledWith(session.date)
    expect(onOpenRun).not.toHaveBeenCalled()
  })

  it('honours a skip even when a recording is available', () => {
    const { onOpenRun } = show({ coach: coachWith(entry({ status: 'Skipped', activityId: 'exact-recording' })), runs: [recorded()] })
    const row = screen.getByRole('list', { name: 'This week’s workouts' }).querySelector<HTMLButtonElement>('[aria-current="date"]')!
    expect(row).toHaveTextContent('Skipped')
    expect(row).toHaveTextContent('planned')
    expect(row).not.toHaveTextContent('4.2 km')
    fireEvent.click(row)
    expect(onOpenRun).not.toHaveBeenCalled()
  })

  it('does not choose arbitrarily between two matching recordings', () => {
    const { onOpenRun, onOpenDay } = show({ runs: [recorded(), recorded({ id: 'another-recording' })] })
    const row = screen.getByRole('list', { name: 'This week’s workouts' }).querySelector<HTMLButtonElement>('[aria-current="date"]')!
    expect(row).toHaveTextContent('planned')
    expect(row).not.toHaveTextContent('4.2 km')
    fireEvent.click(row)
    expect(onOpenRun).not.toHaveBeenCalled()
    expect(onOpenDay).toHaveBeenCalledWith(session.date)
  })

  it('keeps same-day strength separate from the running workout', () => {
    const strength = week.sessions.find(value => value.type === 'Strength')!
    show({ week: { ...week, sessions: [...week.sessions.filter(value => value !== strength), { ...strength, date: session.date }] } })
    const row = screen.getByRole('list', { name: 'This week’s workouts' }).querySelector<HTMLButtonElement>('[aria-current="date"]')!
    expect(row.querySelector('strong')).toHaveTextContent(session.title)
    expect(row.querySelector('strong')).not.toHaveTextContent(strength.title)
    expect(row).toHaveTextContent('+ Strength')
  })

  it('does not substitute another recording when the saved source has expired', () => {
    const { onOpenRun, onOpenDay } = show({ coach: coachWith(entry({ activityId: 'exact-recording' })), runs: [recorded({ source: { kind: 'Strava', viewUrl: null, cachedUntil: '2026-10-19T00:00:00Z', recordedOnGarmin: false } }), recorded({ id: 'some-other-recording' })] })
    const row = screen.getByRole('list', { name: 'This week’s workouts' }).querySelector<HTMLButtonElement>('[aria-current="date"]')!
    expect(row).toHaveTextContent('recording unavailable')
    expect(row).toHaveTextContent('planned')
    fireEvent.click(row)
    expect(onOpenRun).not.toHaveBeenCalled()
    expect(onOpenDay).toHaveBeenCalledWith(session.date)
  })

  it('does not invent zero progress or missing logs while activity evidence is unknown', () => {
    show({ coach: undefined })
    expect(screen.queryByText(/logged or recorded/)).not.toBeInTheDocument()
    expect(screen.queryByText('Not logged')).not.toBeInTheDocument()
  })

  it('keeps dates outside a short first week distinct from prescribed rest', () => {
    show({ plan: { ...plan, startDate: '2026-10-21' } })
    const list = screen.getByRole('list', { name: 'This week’s workouts' })
    const buttons = within(list).getAllByRole('button')
    expect(buttons[0]).toBeDisabled()
    expect(buttons[1]).toBeDisabled()
    expect(buttons[0]).toHaveTextContent('Outside this plan')
    expect(buttons[0]).not.toHaveTextContent('Rest day')
  })
})
