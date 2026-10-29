import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { formatDate } from '../../lib/format'
import type { ActivitySummary, CheckIn, CheckInRequest } from '../../lib/types'
import { planFixture, server } from '../../test/server'
import { Journey } from '../../test/run-history-journey'
import { current, today } from '../../test/run-history-data'

function persistence() {
  let entries: CheckIn[] = []
  const save = vi.fn()
  server.use(
    http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json(entries)),
    http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ id: current.id, plan: planFixture, coaching: [] })),
    http.put('*/api/v1/me/plans/:planId/check-ins/additional/:id/:date/:sessionType', async ({ request, params }) => {
      const answers = await request.json() as CheckInRequest
      const entry = { ...answers, id: params.id, date: params.date, sessionType: params.sessionType, isAdditional: true, pain: answers.pain ?? 'None', painArea: null, effort: answers.effort ?? null, updatedAt: `${today}T12:00:00Z` } as CheckIn
      save(entry)
      entries = [...entries.filter(c => c.id !== entry.id), entry]
      return HttpResponse.json(entry)
    }),
    http.delete('*/api/v1/me/plans/:planId/check-ins/additional/:id', ({ params }) => {
      entries = entries.filter(c => c.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('*/api/v1/me/running', () => HttpResponse.json(entries.map(c => ({ date: c.date, distanceKm: c.distanceKm ?? 0, distanceUnreported: c.distanceUnreported, source: 'Ticked' })))),
  )
  return { save, entries: () => entries }
}

describe('saved runs stay visible throughout the logging journey', () => {
  it.each([
    ['rest day', '2026-10-14'],
    ['strength day', '2026-10-12'],
    ['scheduled run day', '2026-10-13'],
  ])('keeps a linked run visible on a %s after save, navigation, cache expiry and reload', async (_, date) => {
    const persisted = persistence()
    const imported = { id: `strava-${date}`, localDate: date, startedAt: `${date}T06:00:00Z`, kind: 'Run', distanceKm: 10, movingSeconds: 3600, source: { kind: 'Strava' } } as ActivitySummary
    const name = `Additional run on ${formatDate(date, 'long')}`
    const user = userEvent.setup()
    const { rerender, unmount } = render(<Journey runs={[imported]} />)
    const running = screen.getByRole('region', { name: 'Your running' })
    await user.click(await within(running).findByRole('button', { name: 'Log this run' }))
    await user.click(within(running).getByRole('button', { name: 'Save check-in' }))
    const saved = await within(running).findByRole('article', { name })
    expect(within(saved).getByText('10 km · 1:00:00')).toBeVisible()
    expect(within(running).queryByRole('button', { name: 'Log this run' })).not.toBeInTheDocument()
    expect(persisted.entries()).toHaveLength(1)
    expect(persisted.entries()[0]).toMatchObject({ date, activityId: imported.id, distanceKm: null, distanceUnreported: true })

    await user.click(screen.getByRole('button', { name: 'Visit calendar' }))
    const week = screen.getByRole('tabpanel', { name: 'This week' })
    const inCalendar = await within(week).findByRole('article', { name })
    expect(within(inCalendar).getByText('10 km · 1:00:00')).toBeVisible()
    expect(within(week).getAllByRole('article', { name })).toHaveLength(1)
    expect(within(week).queryByText(/Unplanned run/)).not.toBeInTheDocument()
    expect(within(week).queryAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true)
    if (date === '2026-10-14') expect(within(inCalendar.closest('li')!).getByText('Rest', { exact: true })).toBeVisible()
    if (date === '2026-10-12') expect(within(inCalendar.closest('li')!).getByText('Strength & mobility', { exact: true })).toBeVisible()
    if (date === '2026-10-13') expect(within(inCalendar.closest('li')!).getByText('Hill repeats', { exact: true })).toBeVisible()

    // Cache deletion must remove imported measurements, never the saved entry.
    rerender(<Journey runs={[]} />)
    expect(within(within(week).getByRole('article', { name })).getByText(/Distance not recorded/)).toBeVisible()
    expect(within(within(week).getByRole('article', { name })).getByText(/Imported activity is no longer available/)).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'All weeks' }))
    const allWeeks = screen.getByRole('tabpanel', { name: 'All weeks' })
    expect(within(allWeeks).getByRole('article', { name })).toBeVisible()
    const monthDay = within(allWeeks).getByRole('button', { name: new RegExp(`^${Number(date.slice(8))} October: .*1 additional run logged$`) })
    await user.click(monthDay)
    const daySummary = await screen.findByRole('dialog', { name: formatDate(date, 'long') })
    expect(within(daySummary).getByRole('article', { name })).toBeVisible()
    await user.click(within(daySummary).getByRole('button', { name: 'Close day' }))
    expect(monthDay).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Return home' }))
    expect(await screen.findByRole('article', { name })).toBeVisible()
    unmount()
    render(<Journey runs={[]} />)
    expect(await screen.findByRole('article', { name })).toBeVisible()
    expect(persisted.save).toHaveBeenCalledTimes(1)
  })

  it('preserves own metrics and edits exactly one entry, then removes it only when asked', async () => {
    const persisted = persistence()
    const user = userEvent.setup()
    const name = 'Additional run on Wednesday 14 October 2026'
    const imported = { id: 'manual-associated', localDate: '2026-10-14', startedAt: '2026-10-14T06:00:00Z', kind: 'Run', distanceKm: 12, movingSeconds: 4000, source: { kind: 'Strava' } } as ActivitySummary
    const { rerender } = render(<Journey runs={[imported]} />)
    await user.click(await screen.findByRole('button', { name: 'Log this run' }))
    await user.selectOptions(screen.getByLabelText('Run details'), '')
    await user.type(screen.getByLabelText('Distance (km)'), '10')
    await user.type(screen.getByLabelText('Hours'), '1')
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(await screen.findByRole('article', { name })).toHaveTextContent('10 km · 1:00:00')
    expect(await screen.findAllByText('1 run')).toHaveLength(2)
    rerender(<Journey runs={[]} />)
    await user.click(screen.getByRole('button', { name: 'Visit calendar' }))
    const card = await screen.findByRole('article', { name })
    expect(card).toHaveTextContent('10 km · 1:00:00')
    await user.click(within(card).getByRole('button', { name: 'Change how Additional run went' }))
    await user.clear(within(card).getByLabelText('Distance (km)'))
    await user.type(within(card).getByLabelText('Distance (km)'), '11')
    await user.click(within(card).getByRole('button', { name: 'Save check-in' }))
    expect(await within(card).findByText('11 km · 1:00:00')).toBeVisible()
    expect(persisted.entries()).toHaveLength(1)
    await user.click(within(card).getByRole('button', { name: 'Change how Additional run went' }))
    await user.click(within(card).getByRole('button', { name: 'Remove check-in' }))
    expect(screen.queryByRole('article', { name })).not.toBeInTheDocument()
    expect(persisted.entries()).toHaveLength(0)
  })

  it('shows a failed history load and recovers the saved run on retry', async () => {
    persistence()
    let failed = true
    server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => failed ? new HttpResponse(null, { status: 503 }) : HttpResponse.json([
      { id: 'saved-rest-day', date: '2026-10-14', sessionType: 'Easy', status: 'Done', distanceKm: 10, duration: '01:00:00', isAdditional: true, pain: 'None', effort: null },
    ])))
    const user = userEvent.setup()
    render(<Journey runs={[]} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Your saved runs couldn’t load')
    expect(screen.queryByRole('button', { name: 'Log a run' })).not.toBeInTheDocument()
    failed = false
    await user.click(screen.getByRole('button', { name: 'Retry saved runs' }))
    expect(await screen.findByRole('article', { name: 'Additional run on Wednesday 14 October 2026' })).toHaveTextContent('10 km · 1:00:00')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not lose the form or create an entry after a failed save, and retrying saves once', async () => {
    const persisted = persistence()
    let failed = true
    server.use(http.put('*/api/v1/me/plans/:planId/check-ins/additional/:id/:date/:sessionType', () => failed ? new HttpResponse(null, { status: 503 }) : undefined))
    const user = userEvent.setup()
    render(<Journey runs={[]} />)
    await user.click(await screen.findByRole('button', { name: 'Log a run' }))
    await user.clear(screen.getByLabelText('Run date'))
    await user.type(screen.getByLabelText('Run date'), '2026-10-14')
    await user.type(screen.getByLabelText('Minutes'), '42')
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side. Please try again in a moment.')
    expect(screen.getByLabelText('Minutes')).toHaveValue('42')
    expect(persisted.entries()).toHaveLength(0)
    failed = false
    await user.dblClick(screen.getByRole('button', { name: 'Save check-in' }))
    expect(await screen.findByRole('article', { name: 'Additional run on Wednesday 14 October 2026' })).toHaveTextContent('Distance not recorded · 42:00')
    expect(persisted.save).toHaveBeenCalledTimes(1)
  })

  it('shows multiple saved runs on one rest day once each, including uploaded and time-only entries', async () => {
    persistence()
    const date = '2026-10-14'
    const entries = [
      { id: 'uploaded-log', date, sessionType: 'Easy', status: 'Done', isAdditional: true, activityId: 'upload', distanceUnreported: true, distanceKm: null, duration: null, pain: 'None', effort: null },
      { id: 'time-only', date, sessionType: 'Easy', status: 'Done', isAdditional: true, activityId: null, distanceUnreported: true, distanceKm: null, duration: '00:42:00', pain: 'None', effort: null },
    ]
    server.use(http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json(entries)))
    const uploaded = { id: 'upload', localDate: date, startedAt: `${date}T06:00:00Z`, kind: 'Run', distanceKm: 5, movingSeconds: 1800, source: { kind: 'Upload' } } as ActivitySummary
    const user = userEvent.setup()
    render(<Journey runs={[uploaded]} />)
    await user.click(screen.getByRole('button', { name: 'Visit calendar' }))
    const week = screen.getByRole('tabpanel', { name: 'This week' })
    const cards = await within(week).findAllByRole('article', { name: 'Additional run on Wednesday 14 October 2026' })
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('5 km · 30:00')
    expect(cards[1]).toHaveTextContent('Distance not recorded · 42:00')
    expect(within(week).queryByText('Unplanned run · 5 km')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'All weeks' }))
    expect(screen.getByRole('button', { name: /^14 October: rest.*2 additional runs logged$/ })).toBeVisible()
  })

  it('does not remove a saved run when its delete request fails', async () => {
    persistence()
    server.use(
      http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([{ id: 'kept', date: '2026-10-14', sessionType: 'Easy', status: 'Done', isAdditional: true, distanceKm: 10, pain: 'None', effort: null }])),
      http.delete('*/api/v1/me/plans/:planId/check-ins/additional/:id', () => new HttpResponse(null, { status: 503 })),
    )
    const user = userEvent.setup()
    render(<Journey runs={[]} />)
    const card = await screen.findByRole('article', { name: 'Additional run on Wednesday 14 October 2026' })
    await user.click(within(card).getByRole('button', { name: 'Change how Additional run went' }))
    await user.click(within(card).getByRole('button', { name: 'Remove check-in' }))
    expect(await within(card).findByRole('alert')).toBeVisible()
    expect(card).toBeVisible()
    await user.click(within(card).getByRole('button', { name: 'Cancel' }))
    expect(card).toHaveTextContent('10 km')
  })
})
