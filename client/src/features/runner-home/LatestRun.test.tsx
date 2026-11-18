import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, StravaStatus } from '../../lib/types'
import { LatestRun } from './LatestRun'
import { syncedAgo } from './latest-run'
const run = (id: string, date: string, kind: 'Strava' | 'Upload' = 'Strava') => ({ id, startedAt: `${date}T07:00:00Z`, localDate: date, kind: 'Run', distanceKm: 8.6, movingSeconds: 3436, source: { kind } }) as ActivitySummary
const show = (runs: ActivitySummary[]) => {
  const onOpenRun = vi.fn(), onOpenRuns = vi.fn()
  const rendered = render(<LatestRun runs={runs} units="km" today="2026-11-06" onOpenRun={onOpenRun} onOpenRuns={onOpenRuns} />)
  return { ...rendered, onOpenRun, onOpenRuns }
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
describe('compact recent activity on Home', () => {
  it('opens the latest actual recording and keeps the rest accessible', async () => {
    const opened = show([run('old', '2026-11-02'), run('new', '2026-11-05')])
    expect(screen.getByRole('region', { name: 'Recent activity' })).toHaveTextContent('8.6 km')
    expect(screen.getByText(/Strava$/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'View run' }))
    expect(opened.onOpenRun).toHaveBeenCalledWith('new')
    await userEvent.click(screen.getByRole('button', { name: 'All runs' }))
    expect(opened.onOpenRuns).toHaveBeenCalledOnce()
  })
  it('stays empty when no recording exists, including a connected account', () => {
    const { container } = render(<LatestRun runs={[]} strava={{ connected: true } as StravaStatus} units="km" today="2026-11-06" onOpenRun={vi.fn()} onOpenRuns={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('does not show future-dated recordings', () => expect(show([run('future', '2027-01-01')]).container).toBeEmptyDOMElement())
  it('expires successive cached recordings while the screen remains open', async () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-11-06T09:00:00Z'); vi.setSystemTime(now)
    const a = { ...run('new', '2026-11-05'), source: { kind: 'Strava' as const, viewUrl: null, recordedOnGarmin: false, cachedUntil: new Date(now + 200).toISOString() } }
    const b = { ...run('old', '2026-11-04'), source: { kind: 'Strava' as const, viewUrl: null, recordedOnGarmin: false, cachedUntil: new Date(now + 400).toISOString() } }
    const opened = show([a, b])
    expect(screen.getByText(/5 Nov/)).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(201))
    expect(screen.getByText(/4 Nov/)).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(201))
    expect(opened.container).toBeEmptyDOMElement()
  })
  it('retains the plain-language sync formatter for source diagnostics', () => {
    const now = Date.parse('2026-11-06T12:00:00Z')
    expect(syncedAgo('2026-11-06T11:59:50Z', now)).toBe('just now')
    expect(syncedAgo('2026-11-06T11:00:00Z', now)).toBe('1 hour ago')
    expect(syncedAgo('2026-11-04T12:00:00Z', now)).toBe('2 days ago')
  })
})
