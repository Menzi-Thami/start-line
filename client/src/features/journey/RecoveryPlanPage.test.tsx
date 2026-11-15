import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { chapter, journeyOf, maintenance, PLAN_ID, raceResult, recovery } from './journey-fixtures'
import { RecoveryPlanPage } from './RecoveryPlanPage'
import type { Journey } from './types'
import type { JourneyActions } from './useJourney'

function actions(overrides: Partial<JourneyActions> = {}): JourneyActions {
  return {
    refresh: vi.fn(), celebrated: vi.fn(async () => {}), saveRaceResult: vi.fn(async () => raceResult()), deleteRaceResult: vi.fn(async () => {}),
    startRecovery: vi.fn(async () => recovery()), changeRecovery: vi.fn(async () => recovery()), checkIn: vi.fn(async () => recovery()),
    startMaintenance: vi.fn(async () => {}), endMaintenance: vi.fn(async () => {}), ...overrides,
  }
}
function show(data: Journey, today: string, act = actions()) {
  render(<RecoveryPlanPage units="km" today={today} journey={{ state: { kind: 'ready', journey: data, refreshFailed: false }, actions: act }} onNewRace={vi.fn()} onOpenJourney={vi.fn()} />)
  const maintaining = data.maintenance?.status === 'Active' && !['Active', 'Paused'].includes(data.recovery?.status ?? '')
  expect(screen.getByRole('heading', { name: maintaining ? 'Your easy-running plan.' : 'Your recovery plan.' })).toBeVisible()
  expect(document.querySelector('.training-story')).not.toBeInTheDocument()
  expect(document.querySelector('.race-result')).not.toBeInTheDocument()
  return act
}

describe('Recovery plan setup', () => {
  it('opens the selected new race instead of a completed recovery from an older event', async () => {
    window.history.replaceState(null, '', `/?view=recovery&race=${raceResult().id}`)
    const act = show(journeyOf([chapter({ raceResult: raceResult() })], { recovery: recovery({ planId: 'older-plan', status: 'Completed', eventName: 'An earlier race' }) }), '2026-11-16')
    expect(screen.getByRole('button', { name: 'Start my recovery' })).toBeVisible()
    expect(screen.queryByText('Choose your next chapter.')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start my recovery' }))
    expect(act.startRecovery).toHaveBeenCalledWith(expect.objectContaining({ planId: PLAN_ID, raceDate: '2026-11-15', distanceKm: 21.1 }))
  })

  it('uses saved race details for a separate optional recovery plan', async () => {
    const act = show(journeyOf([chapter({ raceResult: raceResult() })]), '2026-11-16')
    expect(screen.getByText(/half marathon, recovery usually takes about 7–14 days/)).toBeInTheDocument()
    expect(act.startRecovery).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Start my recovery' })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Distance (km)' })).not.toBeInTheDocument()
  })

  it('starts recovery from the race the runner reported, with their choices', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ raceResult: raceResult() })]), '2026-11-16')
    await user.click(screen.getByText('Adjust recovery preferences'))
    await user.click(screen.getByLabelText(/All out/))
    await user.click(screen.getByLabelText('Mostly rest'))
    await user.click(screen.getByText('Adjust recovery preferences'))
    expect(screen.queryByLabelText(/All out/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start my recovery' }))
    await waitFor(() => expect(act.startRecovery).toHaveBeenCalledWith(expect.objectContaining({
      planId: PLAN_ID, distanceKm: 21.1, raceDate: '2026-11-15', effort: 'AllOut', preference: 'Rest',
    })))
  })

  it('turns red flags into safety advice before anything else', async () => {
    const user = userEvent.setup()
    show(journeyOf([chapter({ raceResult: raceResult() })]), '2026-11-16')
    await user.click(screen.getByText('Anything worrying?'))
    await user.click(screen.getByLabelText('Chest pain or a racing heart'))
    expect(screen.getByRole('alert')).toHaveTextContent(/call emergency services/)
    await user.click(screen.getByText('Anything worrying?'))
    expect(screen.getByRole('alert')).toBeVisible()
  })
})

describe('Recovery as its own state', () => {
  it('shows the recovery day, today’s optional idea and a check-in, with no completion score', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ raceResult: raceResult(), lifecycle: 'Recovering' })], { recovery: recovery() }), '2026-11-18')
    expect(screen.getByText('Recovery · day 3')).toBeInTheDocument()
    expect(within(document.querySelector('.recovery-today') as HTMLElement).getByText('Easy walk')).toBeVisible()
    // Training Story may show its historical completion percentage; recovery itself has no completion score.
    expect(document.querySelector('.recovery')?.textContent).not.toMatch(/\d+%/)
    await user.click(screen.getByRole('button', { name: 'Still sore' }))
    await waitFor(() => expect(act.checkIn).toHaveBeenCalledWith(recovery().id, { feeling: 'StillSore', redFlags: [], date: '2026-11-18' }))
    const week = screen.getByRole('list', { name: 'This recovery week' })
    expect(within(week).getByLabelText('Mon 16 Nov: Rest, optional')).toBeInTheDocument()
    expect(within(week).getByLabelText('Sun 22 Nov: Easy run, optional, only if you feel ready')).toBeInTheDocument()
  })

  it('leaves days after the recovery ends neutral, never rest', () => {
    show(journeyOf([chapter({ raceResult: raceResult() })], { recovery: recovery() }), '2026-11-25')
    const week = screen.getByRole('list', { name: 'This recovery week' })
    expect(within(week).getByLabelText('Wed 25 Nov: Rest, optional')).toBeInTheDocument()
    expect(within(week).getByLabelText('Thu 26 Nov: not part of your recovery')).toBeInTheDocument()
    expect(within(week).getByLabelText('Sun 29 Nov: not part of your recovery')).toBeInTheDocument()
  })

  it('says to get checked, and suggests nothing, in the seek-care state', () => {
    show(journeyOf([chapter({ raceResult: raceResult() })], { recovery: recovery({ seekCare: true, readiness: 'PainOrInjury', safetyMessage: 'Please see a doctor or physio before exercising.' }) }), '2026-11-18')
    expect(screen.getByRole('heading', { name: 'Let’s get that checked' })).toBeInTheDocument()
    expect(screen.getByText('Please see a doctor or physio before exercising.')).toBeInTheDocument()
    expect(screen.queryByText('Today’s idea · optional')).not.toBeInTheDocument()
  })

  it('pauses and extends without penalty', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ raceResult: raceResult() })], { recovery: recovery() }), '2026-11-18')
    await user.click(screen.getByRole('button', { name: 'Add 3 more days' }))
    await waitFor(() => expect(act.changeRecovery).toHaveBeenCalledWith(recovery().id, { action: 'Extend', extendDays: 3, expectedVersion: recovery().version }))
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(act.changeRecovery).toHaveBeenCalledWith(recovery().id, { action: 'Pause', expectedVersion: recovery().version }))
  })

  it('offers maintenance and another race as equal choices once recovered', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ raceResult: raceResult(), lifecycle: 'Recovered' })], { recovery: recovery({ status: 'Completed', endedOn: '2026-11-25' }) }), '2026-11-26')
    expect(screen.getByRole('button', { name: /Keep running comfortably/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Train for another race/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Keep running comfortably/ }))
    await user.click(screen.getByRole('button', { name: 'Start easy running' }))
    await waitFor(() => expect(act.startMaintenance).toHaveBeenCalledWith({ daysPerWeek: 3, runDays: ['Tuesday', 'Thursday', 'Saturday'], includeStrength: false }))
  })

  it('shows maintenance once chosen, with no race date and nothing to miss', () => {
    show(journeyOf([chapter({ raceResult: raceResult() })], { recovery: recovery({ status: 'Completed' }), maintenance: maintenance() }), '2026-12-02')
    expect(screen.getByRole('heading', { name: '3 easy runs a week' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Choose your next chapter.' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Good to go' })).not.toBeInTheDocument()
  })

  it('shows a four-week calendar with tappable days, neutral free days and longer-run details', async () => {
    const current = maintenance()
    const weeks = [current.weeks[0]!, ...['2026-12-07', '2026-12-14', '2026-12-21'].map(weekStart => ({ weekStart, sessions: [] }))]
    show(journeyOf([], { maintenance: maintenance({ weeks }) }), '2026-12-02')
    const user = userEvent.setup()
    const calendar = screen.getByRole('region', { name: 'Easy-running calendar' })
    expect(within(calendar).getByRole('list', { name: 'Choose a day' })).toBeVisible()
    expect(within(calendar).getByText('Week 1 of 4')).toBeVisible()
    await user.click(within(calendar).getByRole('button', { name: /Thu 3 Dec: Easy run/ }))
    expect(within(calendar).getByText(/Conversational/)).toBeVisible()
    await user.click(within(calendar).getByRole('button', { name: /Wed 2 Dec: no run scheduled/ }))
    expect(within(calendar).getByText('Free day. Nothing is scheduled or missed.')).toBeVisible()
    await user.click(within(calendar).getByRole('button', { name: 'Next easy-running week' }))
    expect(within(calendar).getByText('Week 2 of 4')).toBeVisible()
  })

  it('keeps the easy-running plan reachable when the earlier recovery is no longer returned', () => {
    show(journeyOf([], { maintenance: maintenance() }), '2026-12-02')
    expect(screen.getByRole('heading', { name: '3 easy runs a week' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Stop maintenance' })).toBeVisible()
    expect(screen.queryByText('Finding your saved race…')).not.toBeInTheDocument()
  })
})
