import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { chapter, journeyOf, maintenance, PLAN_ID, raceResult, recovery } from './journey-fixtures'
import { JourneyHomeCard } from './JourneyHomeCard'
import type { Journey } from './types'
import type { JourneyActions } from './useJourney'

function show(data: Journey) {
  const onOpenPlan = vi.fn(), onOpenJourney = vi.fn(), onOpenRecovery = vi.fn(), onNewRace = vi.fn()
  render(<JourneyHomeCard today="2026-11-16" currentPlanId={null} journey={{ state: { kind: 'ready', journey: data, refreshFailed: false }, actions: {} as JourneyActions }}
    onOpenPlan={onOpenPlan} onOpenJourney={onOpenJourney} onOpenRecovery={onOpenRecovery} onNewRace={onNewRace} />)
  return { onOpenPlan, onOpenJourney, onOpenRecovery, onNewRace }
}

it('opens the independent easy-running plan after training and recovery have ended', async () => {
  const opened = show(journeyOf([], { maintenance: maintenance() }))
  await userEvent.click(screen.getByRole('button', { name: 'Open easy running' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledOnce()
  expect(opened.onOpenPlan).not.toHaveBeenCalled()
})

it('shows a saved training chapter after race day and never assumes a race finish or starts recovery', async () => {
  const opened = show(journeyOf([chapter({ status: 'Concluded', lifecycle: 'Concluded' })]))
  expect(screen.getByText('Training concluded')).toBeVisible()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Explore recovery options' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Review my race' }))
  expect(opened.onOpenJourney).toHaveBeenCalledWith(PLAN_ID)
  expect(opened.onOpenRecovery).not.toHaveBeenCalled()
})

it('reuses a confirmed finish when opening its independent recovery plan', async () => {
  const result = raceResult({ finishTime: '02:06:15', distanceKm: 20.3, timeKind: 'RecordedElapsed' })
  const opened = show(journeyOf([chapter({ status: 'Concluded', lifecycle: 'Concluded', raceResult: result })]))
  expect(screen.getByText(/2:06:15.*Recording elapsed time/)).toBeVisible()
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Review my race' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Explore recovery options' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledWith(result.id)
  expect(opened.onOpenPlan).not.toHaveBeenCalled()
})

it('uses Home only as a recovery preview, with all recovery controls on its own plan', async () => {
  const opened = show(journeyOf([chapter({ status: 'Concluded', lifecycle: 'Concluded', raceResult: raceResult() })], { recovery: recovery() }))
  expect(screen.getByText('Recovery plan · day 1')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Still sore' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Your training chapter.' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open recovery plan' }))
  expect(opened.onOpenRecovery).toHaveBeenCalledWith()
  expect(opened.onOpenJourney).not.toHaveBeenCalled()
})

it('invites a new runner to choose a first goal without implying a past training history', async () => {
  const opened = show(journeyOf([]))
  expect(screen.getByRole('heading', { name: 'What are you running towards?' })).toBeVisible()
  expect(screen.queryByText(/training chapters stay with you/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Choose my goal' }))
  expect(opened.onNewRace).toHaveBeenCalledOnce()
})
