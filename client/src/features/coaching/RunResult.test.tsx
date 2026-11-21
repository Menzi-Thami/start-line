import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CheckIn } from '../../lib/types'
import { RunResult } from './RunResult'

const selfReported = (fields: Partial<CheckIn> = {}): CheckIn => ({
  date: '2026-11-24',
  sessionType: 'Easy',
  status: 'Done',
  effort: 3,
  pain: 'None',
  painArea: null,
  distanceKm: null,
  duration: null,
  note: null,
  activityId: null,
  actualSessionType: null,
  prescribedKm: 8,
  distanceUnreported: false,
  isAdditional: false,
  updatedAt: '2026-11-24T18:00:00Z',
  ...fields,
} as CheckIn)

describe('runner-authored mileage evidence (R23)', () => {
  it('labels completed planned distance as prescribed, never as measured actual kilometres', () => {
    render(<RunResult entry={selfReported()} units="km" />)
    expect(screen.getByText(/Actual distance not entered; 8 km prescribed at completion/)).toBeInTheDocument()
    expect(screen.getByText(/Time not recorded/)).toBeInTheDocument()
    expect(screen.queryByText(/GPS measured/)).not.toBeInTheDocument()
  })

  it('retains the distance the runner personally entered as actual, independent of any imported source', () => {
    render(<RunResult entry={selfReported({ distanceKm: 6.3, duration: '00:41:00' })} units="km" compact />)
    expect(screen.getByText(/6.3 km · 41:00/)).toBeInTheDocument()
    expect(screen.queryByText(/8 km prescribed/)).not.toBeInTheDocument()
  })

  it('does not invent mileage when the runner explicitly reports distance unknown', () => {
    render(<RunResult entry={selfReported({ status: 'CutShort', distanceUnreported: true })} units="km" compact />)
    expect(screen.getByText('Distance not recorded')).toBeInTheDocument()
    expect(screen.queryByText(/8 km/)).not.toBeInTheDocument()
  })
})
