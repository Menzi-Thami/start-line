import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkoutStages } from './WorkoutStages'

describe('stage evidence presentation', () => {
  it('describes partial coverage without changing it into workout completion', () => {
    render(<WorkoutStages units="km" execution={{ stages: [{ number: 1, kind: 'Run', plannedMetres: 2000, plannedSeconds: null, recordedMetres: 1000, movingSeconds: 300, elapsedSeconds: 330, coverage: .5, paceSecondsPerKm: 300, fastestSecondsPerKm: 290, slowestSecondsPerKm: 310, inTargetShare: .8 }] }} />)
    expect(screen.getByText(/Partial window/)).toBeVisible()
    expect(screen.getByText(/80% of sampled/)).toBeVisible()
    expect(screen.getByText(/Estimated alignment/)).toBeVisible()
    expect(screen.queryByText(/Completed as prescribed/)).not.toBeInTheDocument()
  })
  it('shows honest unavailable evidence on older recordings', () => {
    render(<WorkoutStages units="mi" />)
    expect(screen.getByText(/Detailed stage evidence is unavailable/)).toBeVisible()
  })
})
