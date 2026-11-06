import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, StravaStatus } from '../../lib/types'
import { LatestRun } from './LatestRun'
import { syncedAgo } from './latest-run'

const run = (id: string, localDate: string, plannedTitle: string | null, kind: 'Strava' | 'Upload' = 'Strava') => ({
  id, startedAt: `${localDate}T07:00:00Z`, localDate, kind: 'Run', distanceKm: 8.6, movingSeconds: 3436, paceSecondsPerKm: 399.5,
  plannedTitle, plannedSessionType: null, pace: null, averageHeartRate: null, source: { kind },
}) as unknown as ActivitySummary
const strava: StravaStatus = { available: true, connected: true, status: 'Active', includesPrivateRuns: false, connectedAt: '2026-10-20T08:00:00Z', lastSyncedAt: '2026-11-06T08:55:00Z', pending: 0, failed: 0, syncedRuns: 2 }

describe('latest run on Home', () => {
  it('shows the newest run, its source, the session it matched and when Strava last synced', () => {
    vi.setSystemTime(new Date('2026-11-06T09:00:00Z'))
    render(<LatestRun runs={[run('old', '2026-11-02', null), run('new', '2026-11-05', 'Tempo run')]} strava={strava} units="km" today="2026-11-06" onOpenRun={() => {}} onOpenRuns={() => {}} />)
    expect(screen.getByText(/Strava$/)).toBeInTheDocument()
    expect(screen.getByText('Matched: Tempo run')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Strava synced 5 minutes ago')
    vi.useRealTimers()
  })

  it('says it is waiting for a first run when Strava is connected, and shows nothing when there is nothing real to show', () => {
    const { rerender, container } = render(<LatestRun runs={[]} strava={strava} units="km" today="2026-11-06" onOpenRun={() => {}} onOpenRuns={() => {}} />)
    expect(screen.getByText(/Your next Strava run will show here/)).toBeInTheDocument()
    rerender(<LatestRun runs={[]} units="km" today="2026-11-06" onOpenRun={() => {}} onOpenRuns={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('describes sync times in plain words', () => {
    const now = Date.parse('2026-11-06T12:00:00Z')
    expect(syncedAgo('2026-11-06T11:59:50Z', now)).toBe('just now')
    expect(syncedAgo('2026-11-06T11:00:00Z', now)).toBe('1 hour ago')
    expect(syncedAgo('2026-11-04T12:00:00Z', now)).toBe('2 days ago')
  })
})
