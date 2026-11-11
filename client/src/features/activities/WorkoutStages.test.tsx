import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WorkoutExecution } from '../../lib/types'
import { WorkoutStages } from './WorkoutStages'

type Stage = WorkoutExecution['stages'][number]
const effort = (number: number, pace: number, coverage = 1): Stage => ({ number, kind: 'Run', plannedMetres: 1000, plannedSeconds: null, recordedMetres: 1000 * coverage, movingSeconds: pace * coverage, elapsedSeconds: pace * coverage, coverage, paceSecondsPerKm: pace, fastestSecondsPerKm: 290, slowestSecondsPerKm: 310, inTargetShare: .8 })
const recovery = (number: number): Stage => ({ number, kind: 'Recover', plannedMetres: null, plannedSeconds: 90, recordedMetres: 250, movingSeconds: 90, elapsedSeconds: 90, coverage: 1, paceSecondsPerKm: 420, fastestSecondsPerKm: null, slowestSecondsPerKm: null, inTargetShare: null })
const show = (stages: Stage[]) => render(<WorkoutStages units="km" execution={{ stages }} />)

describe('each part of the workout', () => {
  it('says the whole workout was hit when every effort is on target, and labels every part', () => {
    show([effort(1, 300), recovery(2), effort(3, 295)])
    expect(screen.getByText('Workout hit')).toBeVisible()
    expect(screen.getByText(/Every effort on target \(2 of 2\)/)).toBeVisible()
    expect(screen.getAllByText('On target')).toHaveLength(2)
    expect(screen.getByText('Done')).toBeVisible()
    expect(screen.getByRole('img', { name: '5:00/km, on target (4:50/km–5:10/km)' })).toBeInTheDocument()
  })

  it('says when efforts went too fast or too slow, and when the target was missed', () => {
    show([effort(1, 260), effort(2, 300), effort(3, 255), recovery(4)])
    expect(screen.getByText('Target missed')).toBeVisible()
    expect(screen.getByText(/1 of 3 efforts on target\. Most misses were too fast/)).toBeVisible()
    expect(screen.getAllByText('Too fast')).toHaveLength(2)
  })

  it('counts a cut-short session as cut short, and a part never reached as not run', () => {
    show([effort(1, 300), effort(2, 300, .5), { ...effort(3, 300, 0), paceSecondsPerKm: null }])
    expect(screen.getByText('On target, cut short')).toBeVisible()
    expect(screen.getByText(/Cut short: 1 of 3 parts done/)).toBeVisible()
    expect(screen.getByText('Not run')).toBeVisible()
  })

  it('says simply when a run has no detail to split', () => {
    render(<WorkoutStages units="mi" />)
    expect(screen.getByText(/can’t be split into the workout’s parts/)).toBeVisible()
  })
})
