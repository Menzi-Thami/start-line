import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TrainingPlan } from '../../lib/types'
import type { finishLineSummary } from '../plan/finish-line-model'
import { chapter, journeyOf, maintenance, PLAN_ID, raceResult, recap, recovery } from './journey-fixtures'
import { JourneyPanel } from './JourneyPanel'
import type { Journey, RaceResult } from './types'
import type { JourneyActions } from './useJourney'

const plan = { race: { name: 'Hoka Half Marathon', date: '2026-11-15' }, startDate: '2026-08-24', weeks: [] } as unknown as TrainingPlan
const local: ReturnType<typeof finishLineSummary> = { total: 38, completed: 38, provisional: 0, distanceKm: 312.5, weeks: 12, allConfirmed: true, trainingEnded: true, racePassed: false, earned: true, visible: true }

function actions(overrides: Partial<JourneyActions> = {}): JourneyActions {
  return {
    refresh: vi.fn(),
    celebrated: vi.fn(() => Promise.resolve()),
    saveRaceResult: vi.fn((_: string, body) => Promise.resolve(raceResult({ outcome: body.outcome }))),
    deleteRaceResult: vi.fn(() => Promise.resolve()),
    startRecovery: vi.fn(() => Promise.resolve(recovery())),
    changeRecovery: vi.fn(() => Promise.resolve(recovery())),
    checkIn: vi.fn(() => Promise.resolve(recovery())),
    startMaintenance: vi.fn(() => Promise.resolve()),
    endMaintenance: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

function show(journey: Journey, today: string, act = actions()) {
  render(<JourneyPanel plan={plan} today={today} units="km" planId={PLAN_ID} journey={{ state: { kind: 'ready', journey, refreshFailed: false }, actions: act }} local={local} runDays={['Tuesday', 'Thursday', 'Saturday']} onNewRace={vi.fn()} />)
  return act
}

const trainingAward = (celebratedAt: string | null = null) => ({ id: 'award-training', kind: 'TrainingComplete' as const, planId: PLAN_ID, earnedOn: '2026-11-14', awardedAt: '2026-11-14T10:00:00Z', celebratedAt })

describe('Finish Line on the plan', () => {
  it('plays the training film once as a real dialog, then remembers it on the account', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ achievements: [trainingAward()] })]), '2026-11-14')
    const dialog = screen.getByRole('dialog', { name: 'YOU DID IT.' })
    expect(within(dialog).getByText('The training is done. Race day is next.')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
    expect(within(dialog).getByRole('button', { name: 'See my training story' })).toHaveFocus()
    // Focus stays inside: Tab from the last control comes back to the first.
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(act.celebrated).toHaveBeenCalledWith('award-training')
    // Training complete, race still ahead: no race badge, and race day is next.
    expect(screen.getByText('Training done. The race is still ahead.')).toBeInTheDocument()
    expect(screen.queryByText(/Race finisher/)).not.toBeInTheDocument()
    expect(screen.queryByText('How did race day go?')).not.toBeInTheDocument()
  })

  it('does not replay a film already seen, but the runner can replay it', async () => {
    const user = userEvent.setup()
    show(journeyOf([chapter({ achievements: [trainingAward('2026-11-14T11:00:00Z')] })]), '2026-11-14')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replay finish line' }))
    expect(screen.getByRole('dialog', { name: 'YOU DID IT.' })).toBeInTheDocument()
  })

  it('tells an unfinished plan honestly, with no badge and no measured distance invented', () => {
    show(journeyOf([chapter({ training: recap({ confirmedRuns: 0, allConfirmed: false, raceDatePassed: true, recordedKm: null, recordedRuns: 0, longestRecordedKm: null, longestRecordedOn: null }), weeks: null })]), '2026-11-16')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your race result' })).toBeVisible()
    expect(screen.queryByText(/Training complete · not every run confirmed/)).not.toBeInTheDocument()
    expect(screen.getByText('Not enough evidence')).not.toBeVisible()
    expect(screen.queryByRole('heading', { name: 'How did race day go?' })).not.toBeInTheDocument()
  })

  it('saves a finish the runner reports, with their time, and never links a run for them', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ training: recap({ raceDatePassed: true }) })]), '2026-11-16')
    await user.click(screen.getByRole('button', { name: 'I finished' }))
    await user.type(screen.getByRole('textbox', { name: 'Hours' }), '1')
    await user.type(screen.getByRole('textbox', { name: 'Minutes' }), '52')
    await user.type(screen.getByRole('textbox', { name: 'Seconds' }), '10')
    await user.click(screen.getByRole('button', { name: 'Save race result' }))
    await waitFor(() => expect(act.saveRaceResult).toHaveBeenCalledWith(PLAN_ID, expect.objectContaining({
      outcome: 'Finished', raceDate: '2026-11-15', finishTime: '01:52:10', distanceKm: 21.1, activityId: null,
    })))
    expect(await screen.findByRole('heading', { name: 'Finished in 1:52:10' })).toBeInTheDocument()
  })

  it('keeps what was typed when a save fails, and does not save twice on a double click', async () => {
    const user = userEvent.setup()
    let fail: (reason: Error) => void = () => undefined
    const act = show(journeyOf([chapter({ training: recap({ raceDatePassed: true }) })]), '2026-11-16', actions({
      saveRaceResult: vi.fn(() => new Promise<RaceResult>((_, reject) => { fail = reject })),
    }))
    await user.click(screen.getByText('Other race outcomes'))
    await user.click(screen.getByRole('button', { name: 'I didn’t finish' }))
    await user.clear(screen.getByLabelText('Distance covered (km, optional)'))
    await user.type(screen.getByLabelText('Distance covered (km, optional)'), '14')
    const save = screen.getByRole('button', { name: 'Save race result' })
    await user.click(save)
    await user.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(act.saveRaceResult).toHaveBeenCalledTimes(1)
    fail(new Error('Your connection dropped.'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your connection dropped.')
    expect(screen.getByLabelText('Distance covered (km, optional)')).toHaveValue('14')
  })

  it('offers no recovery after a race not started, and the next chapter instead', () => {
    show(journeyOf([chapter({ raceResult: raceResult({ outcome: 'DidNotStart', finishTime: null, versusGoal: null }) })]), '2026-11-16')
    expect(screen.queryByRole('button', { name: 'Start my recovery' })).not.toBeInTheDocument()
    expect(screen.getByText('You didn’t start this one')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Choose your next chapter.' })).toBeInTheDocument()
  })

  it('offers optional recovery after a finish, and "Not now" creates nothing', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ raceResult: raceResult() })]), '2026-11-16')
    await user.click(screen.getByText('Plan my recovery'))
    expect(screen.getByText('2:50 faster than your 1:55:00 goal.')).toBeInTheDocument()
    expect(screen.getByText(/half marathon, recovery usually takes about 7–14 days/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(act.startRecovery).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Plan my recovery' })).toBeInTheDocument()
  })

  it('starts recovery from the race the runner reported, with their choices', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ raceResult: raceResult() })]), '2026-11-16')
    await user.click(screen.getByText('Plan my recovery'))
    await user.click(screen.getByText('Adjust recovery preferences'))
    await user.click(screen.getByLabelText(/All out/))
    await user.click(screen.getByLabelText('Mostly rest'))
    await user.click(screen.getByRole('button', { name: 'Start my recovery' }))
    await waitFor(() => expect(act.startRecovery).toHaveBeenCalledWith(expect.objectContaining({
      planId: PLAN_ID, distanceKm: 21.1, raceDate: '2026-11-15', effort: 'AllOut', preference: 'Rest',
    })))
  })

  it('turns red flags into safety advice before anything else', async () => {
    const user = userEvent.setup()
    show(journeyOf([chapter({ raceResult: raceResult() })]), '2026-11-16')
    await user.click(screen.getByText('Plan my recovery'))
    await user.click(screen.getByText('Anything worrying?'))
    await user.click(screen.getByLabelText('Chest pain or a racing heart'))
    expect(screen.getByRole('alert')).toHaveTextContent(/call emergency services/)
  })
})

describe('Recovery as its own state', () => {
  it('shows the recovery day, today’s optional idea and a check-in, with no completion score', async () => {
    const user = userEvent.setup()
    const act = show(journeyOf([chapter({ raceResult: raceResult(), lifecycle: 'Recovering' })], { recovery: recovery() }), '2026-11-18')
    expect(screen.getByText('Recovery · day 3')).toBeInTheDocument()
    expect(screen.getByText('Easy walk')).toBeInTheDocument()
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
  })
})

describe('Signed out', () => {
  it('celebrates from this device and says the history lives only here', () => {
    render(<JourneyPanel plan={plan} today="2026-11-16" units="km" local={{ ...local, racePassed: true }} runDays={[]} onSignIn={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'YOU DID IT.' })).toBeInTheDocument()
    expect(screen.getByText(/This story comes from this device only/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in to save your result' })).toBeInTheDocument()
  })
})
