import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { TrainingInsights as Insights } from '../../lib/types'
import { insightsEmpty, server } from '../../test/server'
import { TrainingInsights } from './TrainingInsights'

const auth = { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'thandi@example.test' }, getToken: () => Promise.resolve('test-token') }

const spike: Insights = {
  today: '2026-11-01',
  trends: {
    ...insightsEmpty.trends,
    weeks: insightsEmpty.trends.weeks.map((w, i) => ({ ...w, plannedKm: 20, ranKm: i === 7 ? 40 : 20, runs: 4 })),
    load: { recentKm: 40, baselineWeeklyKm: 20, baselineWeeksRun: 4, changePercent: 100, signal: 'RisingFast' },
    adherence: { planned: 16, done: 14, skipped: 1, unlogged: 1, share: 0.88 },
    easyPace: { recentRuns: 3, earlierRuns: 4, recentSecondsPerKm: 330, earlierSecondsPerKm: 360, changeSecondsPerKm: -30, recentHeartRate: 141, earlierHeartRate: 150 },
    gaps: ['StravaWindow'],
    nextStep: 'HoldVolume',
    reasons: ['LoadSpike'],
  },
  decisions: [
    { weekStart: '2026-10-26', outcome: 'Declined', verdict: 'Struggling', reasons: ['RecoveryFatigue'], changedPlan: true, recovery: 'Tired', decidedAt: '2026-10-25T18:00:00Z' },
  ],
}

function renderInsights(onReview?: () => void) {
  render(
    <AuthContext.Provider value={auth}>
      <TrainingInsights planId="plan-1" units="km" onReview={onReview} />
    </AuthContext.Provider>,
  )
}

describe('Training trends', () => {
  it('explains the next step with its evidence and hands the decision to the weekly review', async () => {
    server.use(http.get('*/api/v1/me/plans/plan-1/insights', () => HttpResponse.json(spike)))
    const onReview = vi.fn()
    renderInsights(onReview)
    expect(await screen.findByRole('heading', { name: 'Hold your distance this week' })).toBeVisible()
    expect(screen.getByText(/last 7 days \(40 km\) are 100% above your average week before that \(20 km\)/)).toBeVisible()
    expect(screen.getByText('14 of 16 planned sessions run in the last four weeks · 1 skipped · 1 not logged.')).toBeVisible()
    expect(screen.getByText(/30s\/km faster than the four weeks before/)).toBeVisible()
    expect(screen.getByText(/Average heart rate 141 bpm, from 150/)).toBeVisible()
    // The weekly bars have a table equivalent for screen readers.
    expect(within(screen.getByRole('table', { name: 'Distance by week' })).getAllByRole('row')).toHaveLength(9)
    await userEvent.click(screen.getByRole('button', { name: 'Review this week’s coaching →' }))
    expect(onReview).toHaveBeenCalledOnce()
    const history = screen.getByRole('region', { name: 'Coaching history' })
    expect(within(history).getByText('Declined')).toBeVisible()
    expect(history).toHaveTextContent('An easier week')
  })

  it('says what it can’t see when there is too little running, and survives a malformed answer', async () => {
    renderInsights()
    expect(await screen.findByRole('heading', { name: 'Log a few more runs first' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Review this week/ })).toBeNull()
    expect(screen.getByText('What these trends can’t see · 2')).toBeVisible()
    expect(screen.getByText(/Not enough easy runs to compare yet/)).toBeVisible()
  })

  it('shows "not available" instead of crashing on an unexpected answer', async () => {
    server.use(http.get('*/api/v1/me/plans/plan-1/insights', () => HttpResponse.json([])))
    renderInsights()
    expect(await screen.findByText('Training trends aren’t available right now.')).toBeVisible()
  })
})
