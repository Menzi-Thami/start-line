import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Activity, Split } from '../../../lib/types'
import longRunFixture from '../../../test/fixtures/activity-long-run.json'
import { PaceSplitsVisual, PlanExecutionCard, RunSummaryHero } from './RunAnalysisHighlights'

const run = longRunFixture as Activity

describe('post-run analysis highlights', () => {
  it('renders the actual distance, time, pace and heart rate with the branded runner', () => {
    render(<RunSummaryHero run={run} units="km" />)
    const summary = screen.getByRole('region', { name: 'Run summary' })
    expect(summary).toHaveTextContent('15.4 km')
    expect(summary).toHaveTextContent('1:42:12')
    expect(summary).toHaveTextContent('6:40/km')
    expect(summary).toHaveTextContent('151')
    expect(summary.querySelector('.runner-sprint')).not.toBeNull()
  })

  it('does not claim a heart-rate measurement when none exists', () => {
    render(<RunSummaryHero run={{ ...run, averageHeartRate: null }} units="km" />)
    expect(screen.queryByText('Avg heart rate')).not.toBeInTheDocument()
  })

  it('uses prescribed data and hides the plan card for an unplanned run', () => {
    const { rerender } = render(<PlanExecutionCard run={run} units="km" />)
    expect(screen.getByRole('heading', { name: 'Plan vs actual' })).toBeInTheDocument()
    expect(screen.getByText(/14 km at/)).toBeInTheDocument()
    rerender(<PlanExecutionCard run={{ ...run, plan: null }} units="km" />)
    expect(screen.queryByRole('heading', { name: 'Plan vs actual' })).not.toBeInTheDocument()
  })

  it('highlights only a full kilometre and expands recorded split evidence', async () => {
    const user = userEvent.setup()
    const splits = [
      { ...run.splits[0]!, number: 1, distanceKm: 1, movingSeconds: 360, paceSecondsPerKm: 360 },
      { ...run.splits[0]!, number: 2, distanceKm: 1, movingSeconds: 350, paceSecondsPerKm: 350 },
      { ...run.splits[0]!, number: 3, distanceKm: 0.35, movingSeconds: 80, paceSecondsPerKm: 228 },
    ] satisfies Split[]
    render(<PaceSplitsVisual splits={splits} units="km" />)
    const fast = screen.getByRole('button', { name: /Kilometre 2, pace/ })
    expect(fast.className).toContain('ra-split-best')
    expect(screen.getByText(/Fastest: KM 2/)).toBeInTheDocument()
    await user.click(fast)
    expect(fast).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('region', { name: 'Your pace splits' })).getByText(/1\.00 km/)).toBeInTheDocument()
    const partial = screen.getByRole('button', { name: /Kilometre 3, pace.*partial split/ })
    expect(partial.className).not.toContain('ra-split-best')
  })

  it('handles missing and invalid split evidence without fabricating results', () => {
    const bad = [{ ...run.splits[0]!, paceSecondsPerKm: 0 }]
    const { rerender } = render(<PaceSplitsVisual splits={bad} units="km" />)
    expect(screen.getByText('No recorded splits for this run.')).toBeInTheDocument()
    rerender(<PaceSplitsVisual splits={[]} units="km" />)
    expect(screen.getByText('No recorded splits for this run.')).toBeInTheDocument()
  })
})
