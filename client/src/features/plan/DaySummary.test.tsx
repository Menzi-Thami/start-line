import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { formatDate } from '../../lib/format'
import type { ActivitySummary, CheckIn, CheckInRequest, Session } from '../../lib/types'
import { planFixture } from '../../test/server'
import type { SessionCoach } from '../coaching/useCheckIns'
import DaySummary from './DaySummary'
import { sessionKey } from './plan-math'

const today = '2026-10-18'
const date = '2026-10-14'
const noop = () => {}
const imported = (id = 'strava-1', localDate = date): ActivitySummary => ({ id, localDate, startedAt: `${localDate}T06:00:00Z`, kind: 'Run', distanceKm: 10, movingSeconds: 4199, averageHeartRate: 140, source: { kind: 'Strava' } } as ActivitySummary)
const entry = (overrides: Partial<CheckIn> = {}): CheckIn => ({ date, sessionType: 'Easy', status: 'Done', effort: 3, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null, updatedAt: `${today}T12:00:00Z`, id: 'saved-1', activityId: 'strava-1', distanceUnreported: true, isAdditional: true, ...overrides })
const save = vi.fn<NonNullable<SessionCoach['saveAdditional']>>().mockResolvedValue(undefined)

function View({ selected = date, runs = [], saved = [], ready = true, signedIn = true, close = noop, failedSave = false, units = 'km', pendingImports = false }: {
  selected?: string; runs?: ActivitySummary[]; saved?: CheckIn[]; ready?: boolean; signedIn?: boolean; close?: () => void; failedSave?: boolean; units?: 'km' | 'mi'; pendingImports?: boolean
}) {
  const [done, setDone] = useState(new Set<string>())
  const [entries, setEntries] = useState(saved)
  const store = async (id: string, session: Session, answers: CheckInRequest, additional: boolean) => {
    await save(id, session, answers)
    if (failedSave) throw new Error('Could not save. Try again.')
    setEntries(current => [...current.filter(item => item.id !== id), entry({ ...answers, id, date: session.date, sessionType: session.type, isAdditional: additional })])
  }
  const coach: SessionCoach = {
    today, units, entries, get: session => entries.find(item => !item.isAdditional && item.date === session.date && item.sessionType === session.type),
    save: (session, answers) => store('planned', session, answers, false), remove: async () => { throw new Error('Could not remove. Try again.') },
    saveAdditional: (id, session, answers) => store(id, session, answers, true), removeAdditional: async () => { throw new Error('Could not remove. Try again.') },
  }
  const effective = new Set(done)
  for (const item of entries.filter(item => !item.isAdditional && item.status !== 'Skipped')) effective.add(sessionKey({ date: item.date, type: item.sessionType }))
  return <DaySummary date={selected} today={today} plan={planFixture} units={units} done={effective} onDoneChange={update => setDone(current => update(current))} runs={pendingImports ? undefined : runs} coach={signedIn && ready ? coach : undefined} canCompleteRuns={ready} onClose={close} />
}
const planned = () => screen.getByRole('region', { name: 'Planned' })
const recorded = () => screen.getByRole('region', { name: 'Recorded' })

describe('calendar day summaries', () => {
  it('shows an automatic rest-day import without changing the plan or logging it', () => {
    render(<View runs={[imported()]} />)
    expect(screen.getByRole('dialog', { name: formatDate(date, 'long') })).toBeVisible()
    expect(planned()).toHaveTextContent('Rest day')
    expect(recorded()).toHaveTextContent('10 km')
    expect(recorded()).toHaveTextContent('1:09:59 · 7:00/km')
    expect(recorded()).toHaveTextContent('140 bpm')
    expect(within(recorded()).getAllByRole('article')).toHaveLength(1)
    expect(within(planned()).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('keeps a prescribed workout outstanding beside a different imported run', () => {
    render(<View selected="2026-10-13" runs={[imported('strava-1', '2026-10-13')]} />)
    expect(planned()).toHaveTextContent('Hill repeats')
    expect(planned()).toHaveTextContent('5.5 km')
    expect(planned()).toHaveTextContent('No completion recorded')
    expect(recorded()).toHaveTextContent('10 km')
    expect(within(planned()).getByRole('checkbox', { name: 'Complete' })).not.toBeChecked()
  })

  it('shows a linked additional entry once rather than repeating its imported activity', () => {
    render(<View runs={[imported()]} saved={[entry()]} />)
    expect(within(recorded()).getAllByRole('article')).toHaveLength(1)
    expect(recorded()).toHaveTextContent('10 km · 1:09:59')
    expect(within(recorded()).queryByRole('button', { name: 'Log this run' })).not.toBeInTheDocument()
  })

  it('keeps multiple independent runs and manual entries on the same day', () => {
    render(<View runs={[imported(), imported('strava-2')]} saved={[entry(), entry({ id: 'manual-2', activityId: null, distanceKm: 4, duration: '00:25:00', distanceUnreported: false })]} />)
    expect(within(recorded()).getAllByRole('article')).toHaveLength(3)
    expect(recorded()).toHaveTextContent('4 km · 25:00')
    expect(recorded()).toHaveTextContent('6:15/km')
  })

  it.each([
    ['unavailable linked details', entry(), 'Distance not recorded'],
    ['own distance after expiry', entry({ distanceKm: 12, duration: '01:00:00', distanceUnreported: false }), '12 km · 1:00:00'],
    ['time-only entry', entry({ activityId: null, duration: '00:40:00' }), 'Distance not recorded · 40:00'],
  ])('retains %s truthfully', (_, saved, text) => {
    render(<View saved={[saved]} />)
    expect(recorded()).toHaveTextContent(text)
    expect(within(recorded()).getAllByRole('article')).toHaveLength(1)
  })

  it('labels a skipped workout without presenting it as completed activity', () => {
    render(<View selected="2026-10-13" saved={[entry({ date: '2026-10-13', sessionType: 'Hills', status: 'Skipped', isAdditional: false, activityId: null })]} />)
    expect(planned()).toHaveTextContent('Skipped')
    expect(recorded()).toHaveTextContent('No activity recorded')
    expect(within(recorded()).queryByLabelText('Completed run')).not.toBeInTheDocument()
  })

  it('shows future workouts without offering completion or a run log', () => {
    render(<View selected="2026-10-20" />)
    expect(planned()).toHaveTextContent('Fartlek')
    expect(planned()).toHaveTextContent('Upcoming')
    expect(recorded()).toHaveTextContent('hasn’t arrived yet')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log a run' })).not.toBeInTheDocument()
  })

  it('does not interpret days outside the plan as prescribed rest or allow logging there', () => {
    render(<View selected="2026-10-01" />)
    expect(planned()).toHaveTextContent('Outside this plan')
    expect(planned()).not.toHaveTextContent('Rest day')
    expect(screen.queryByRole('button', { name: 'Log a run' })).not.toBeInTheDocument()
  })

  it('does not turn a failed or loading check-in request into empty history', () => {
    render(<View ready={false} />)
    expect(recorded()).toHaveTextContent('Saved run history is not available yet')
    expect(recorded()).not.toHaveTextContent('No activity recorded')
    expect(screen.queryByRole('button', { name: 'Log a run' })).not.toBeInTheDocument()
  })

  it('distinguishes unavailable imported history from an empty day while preserving saved entries', () => {
    render(<View pendingImports saved={[entry({ activityId: null, distanceKm: 8, distanceUnreported: false })]} />)
    expect(recorded()).toHaveTextContent('Imported runs have not loaded')
    expect(recorded()).not.toHaveTextContent('No activity recorded')
    expect(recorded()).toHaveTextContent('8 km')
  })

  it('keeps strength completion independent of an imported running activity', async () => {
    render(<View selected="2026-10-12" runs={[imported('strava-1', '2026-10-12')]} />)
    expect(planned()).toHaveTextContent('Strength & mobility')
    await userEvent.setup().click(within(planned()).getByText('View exercises and completion'))
    const complete = within(planned()).getByRole('checkbox', { name: 'Done' })
    expect(complete).not.toBeChecked()
    await userEvent.setup().click(complete)
    expect(recorded()).toHaveTextContent('Strength & mobility completed')
    expect(recorded()).toHaveTextContent('10 km')
  })

  it('preselects the opened date when logging manually, and keeps a failed save editable', async () => {
    render(<View failedSave />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Log a run' }))
    expect(screen.getByLabelText('Run date')).toHaveValue(date)
    await user.type(screen.getByLabelText('Distance (km)'), '8')
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByLabelText('Distance (km)')).toHaveValue(8)
    expect(recorded()).not.toHaveTextContent('8 km')
  })

  it('logs an imported run inside the sheet and keeps it visible once', async () => {
    render(<View runs={[imported()]} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Log this run' }))
    expect(screen.getByLabelText('Run date')).toHaveValue(date)
    expect(screen.getByLabelText('Run details')).toHaveValue('strava-1')
    await user.dblClick(screen.getByRole('button', { name: 'Save check-in' }))
    expect(await screen.findByRole('article', { name: 'Additional run on Wednesday 14 October 2026' })).toHaveTextContent('10 km · 1:09:59')
    expect(within(recorded()).getAllByRole('article')).toHaveLength(1)
    expect(planned()).toHaveTextContent('Rest day')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('retains a saved entry after a failed deletion', async () => {
    render(<View saved={[entry()]} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Change how Additional run went' }))
    await user.click(screen.getByRole('button', { name: 'Remove check-in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove')
    expect(screen.getByRole('article', { name: 'Additional run on Wednesday 14 October 2026' })).toBeVisible()
  })

  it('uses the selected distance units', () => {
    render(<View runs={[imported()]} units="mi" />)
    expect(recorded()).toHaveTextContent('6.2 mi')
    expect(recorded()).toHaveTextContent('11:16/mi')
  })

  it('does not let a tap inside the sheet dismiss it as a backdrop click', () => {
    const close = vi.fn()
    render(<View close={close} />)
    fireEvent.pointerDown(planned())
    fireEvent.click(planned())
    expect(close).not.toHaveBeenCalled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true, bubbles: false }))
    expect(close).toHaveBeenCalledOnce()
  })
})
