import { describe, expect, it } from 'vitest'
import type { TrainingPlan } from '../../lib/types'
import { finishLineSummary } from './finish-line-model'

const plan = {
  startDate: '2026-10-01',
  race: { name: 'Half marathon', date: '2026-11-15' },
  weeks: [
    { sessions: [{ date: '2026-10-02', type: 'Easy', distanceKm: 5 }, { date: '2026-10-04', type: 'Strength', distanceKm: 0 }] },
    { sessions: [{ date: '2026-11-14', type: 'LongRun', distanceKm: 15 }, { date: '2026-11-15', type: 'Race', distanceKm: 21.1 }] },
  ],
} as unknown as TrainingPlan

describe('Finish Line eligibility', () => {
  it('does not award completion for elapsed time or missing workouts', () => {
    const result = finishLineSummary(plan, '2026-11-20', new Set(['2026-10-02|Easy']), new Set())
    expect(result).toMatchObject({ completed: 1, total: 2, earned: false, visible: true })
  })
  it('recognises completed training before race day, but never treats the race as a workout', () => {
    const result = finishLineSummary(plan, '2026-11-14', new Set(['2026-10-02|Easy', '2026-11-14|LongRun']), new Set())
    expect(result).toMatchObject({ completed: 2, total: 2, distanceKm: 20, earned: true, racePassed: false })
  })
  it('does not turn a temporary synced run into a permanent achievement', () => {
    const result = finishLineSummary(plan, '2026-11-14', new Set(['2026-10-02|Easy']), new Set(['2026-11-14|LongRun']))
    expect(result).toMatchObject({ completed: 1, provisional: 1, earned: false, visible: false })
  })
})
