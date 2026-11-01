import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { ProgressStory as Story } from '../../lib/types'
import { progressEmpty, server } from '../../test/server'
import { ProgressStory } from './ProgressStory'

const auth = { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'thandi@example.test' }, getToken: () => Promise.resolve('test-token') }

function story(weeks: number): Story {
  return {
    today: '2026-11-01',
    story: {
      ...progressEmpty.story,
      weeks,
      weekRows: Array.from({ length: weeks }, (_, i) => ({ weekStart: new Date(Date.UTC(2026, 10, 2 - 7 * (weeks - i))).toISOString().slice(0, 10), ranKm: 20 + i, plannedKm: 22, runs: 4, longestKm: 8 + i, isCurrent: i === weeks - 1 })),
      current: { from: '2026-10-05', to: '2026-11-01', km: 92, runs: 16, averageWeeklyKm: 23, longestKm: 12, weeksRun: weeks },
      previous: { from: '2026-09-07', to: '2026-10-04', km: 80, runs: 16, averageWeeklyKm: 20, longestKm: 10, weeksRun: weeks },
      adherence: { planned: 16, done: 14, skipped: 1, unlogged: 1, share: 0.88 },
      easyPace: { recentRuns: 4, earlierRuns: 3, recentSecondsPerKm: 335, earlierSecondsPerKm: 350, changeSecondsPerKm: -15, recentHeartRate: null, earlierHeartRate: null },
      bests: [
        { name: '5K', distanceMetres: 5000, time: '00:24:00', date: '2026-10-25', before: '00:25:00', isNew: true },
        { name: '10K', distanceMetres: 10000, time: '00:52:10', date: '2026-10-18', before: '00:51:00', isNew: false },
      ],
      raceGoal: { raceKm: 10, goal: '00:52:00', raceDate: '2026-12-20', estimates: [{ weekStart: '2026-10-26', time: '00:52:40' }], latest: '00:52:40', first: '00:54:10' },
      gaps: ['StravaWindow'],
    },
  }
}

function renderStory() {
  render(
    <AuthContext.Provider value={auth}>
      <ProgressStory planId="plan-1" units="km" />
    </AuthContext.Provider>,
  )
}

describe('Progress story', () => {
  it('compares the span with the one before, shows bests and the race goal, and switches spans', async () => {
    const asked: string[] = []
    server.use(http.get('*/api/v1/me/plans/plan-1/progress', ({ request }) => {
      const weeks = Number(new URL(request.url).searchParams.get('weeks'))
      asked.push(String(weeks))
      return HttpResponse.json(story(weeks))
    }))
    renderStory()
    const compare = await screen.findByRole('table', { name: 'The last 4 weeks against the 4 weeks before' })
    expect(within(compare).getByRole('row', { name: /Distance 92 km 80 km \+15%/ })).toBeVisible()
    expect(within(compare).getByRole('row', { name: /Longest run 12 km 10 km \+20%/ })).toBeVisible()
    expect(screen.getByRole('table', { name: 'Distance by week, last 4 weeks' })).toBeInTheDocument()
    expect(screen.getByText(/14 of 16 planned sessions run \(88%\)/)).toBeVisible()
    expect(screen.getByText(/15s\/km faster/)).toBeVisible()
    expect(screen.getByText(/new best, from 25:00/)).toBeVisible()
    expect(screen.getByText(/best is 51:00/)).toBeVisible()
    expect(screen.getByText(/Your uploaded runs point to 52:40: 40s slower than your goal. At the start of this span they pointed to 54:10./)).toBeVisible()
    expect(screen.getByRole('button', { name: '4 weeks' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '12 weeks' }))
    expect(await screen.findByRole('table', { name: 'Distance by week, last 12 weeks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '12 weeks' })).toHaveAttribute('aria-pressed', 'true')
    expect(asked).toEqual(['4', '12'])
  })

  it('says what it can’t see when there is nothing to compare, and survives a malformed answer', async () => {
    renderStory()
    expect(await screen.findByText('What this story can’t see · 2')).toBeVisible()
    expect(screen.getByText(/No timed efforts over 1K/)).toBeVisible()

    server.use(http.get('*/api/v1/me/plans/plan-1/progress', () => HttpResponse.json([])))
    await userEvent.click(screen.getByRole('button', { name: '8 weeks' }))
    expect(await screen.findByText('Your progress isn’t available right now.')).toBeVisible()
  })
})
