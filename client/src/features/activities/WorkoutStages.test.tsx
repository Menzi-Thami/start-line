import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkoutStages } from './WorkoutStages'

const stage = { number: 1, kind: 'Run' as const, plannedMetres: 2000, plannedSeconds: null, recordedMetres: 1000, movingSeconds: 300, elapsedSeconds: 330, coverage: .5, paceSecondsPerKm: 300, fastestSecondsPerKm: 290, slowestSecondsPerKm: 310, inTargetShare: .8 }

describe('each part of the workout', () => {
  it('shows each part at a glance: how much was run and where the pace sat against the target', () => {
    render(<WorkoutStages units="km" execution={{ stages: [stage, { ...stage, number: 2, kind: 'Recover', plannedMetres: null, plannedSeconds: 60, coverage: 1, paceSecondsPerKm: 420, fastestSecondsPerKm: null, slowestSecondsPerKm: null, inTargetShare: null }] }} />)
    expect(screen.getByRole('img', { name: 'Part done' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '5:00/km, on target (4:50/km–5:10/km)' })).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('2 km · 50%')).toBeInTheDocument()
  })

  it('says simply when a run has no detail to split', () => {
    render(<WorkoutStages units="mi" />)
    expect(screen.getByText(/can’t be split into the workout’s parts/)).toBeVisible()
  })
})
