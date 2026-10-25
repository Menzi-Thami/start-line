import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { runsByDate } from '../../lib/plan-runs'
import type { ActivitySummary } from '../../lib/types'
import { planFixture } from '../../test/server'
import { WeekList } from './WeekList'

const run = (localDate: string, distanceKm: number): ActivitySummary =>
  ({ id: localDate, startedAt: `${localDate}T06:00:00Z`, localDate, kind: 'Run', distanceKm }) as unknown as ActivitySummary

const list = (props: { today?: string; withRuns?: boolean }) =>
  render(
    <WeekList
      weeks={planFixture.weeks}
      paces={planFixture.paces}
      units="km"
      currentWeek={2}
      done={new Set()}
      onDoneChange={() => undefined}
      runs={props.withRuns === false ? undefined : runsByDate([run('2026-10-13', 5.5), run('2026-10-15', 3), run('2026-10-18', 6)])}
      today={props.today}
    />,
  )

describe('the plan’s week list', () => {
  it('opens each finished week with how it went', () => {
    list({ today: '2026-10-21' })

    expect(screen.getByText('Ran 3 of 4 runs · 14.5 of 17.5 km')).toBeInTheDocument()
    // Week 2 isn't over yet, so it has no review.
    expect(screen.getAllByText('How it went:')).toHaveLength(1)
  })

  it('a shared plan, with no runs or check-ins, has no reviews', () => {
    list({ today: '2026-10-21', withRuns: false })

    expect(screen.queryByText('How it went:')).not.toBeInTheDocument()
  })
})
