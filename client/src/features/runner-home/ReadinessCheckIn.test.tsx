import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { Readiness } from '../../lib/types'
import { server } from '../../test/server'
import { ReadinessCheckIn } from './ReadinessCheckIn'

const auth = { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'thandi@example.test' }, getToken: () => Promise.resolve('test-token') }

/** A readiness API that keeps what the runner does, like the real one. */
function account(initial: Readiness[] = []) {
  let days = [...initial]
  const puts: { date: string; body: unknown }[] = []
  server.use(
    http.get('*/api/v1/me/readiness', () => HttpResponse.json([...days].sort((a, b) => b.date.localeCompare(a.date)))),
    http.put('*/api/v1/me/readiness/:date', async ({ params, request }) => {
      const body = (await request.json()) as Omit<Readiness, 'date' | 'updatedAt'>
      const date = String(params.date)
      puts.push({ date, body })
      const saved = { date, feeling: body.feeling, sleep: body.sleep ?? null, soreness: body.soreness ?? null, note: body.note ?? null, updatedAt: '2026-11-01T06:00:00Z' }
      days = [...days.filter((d) => d.date !== date), saved]
      return HttpResponse.json(saved)
    }),
    http.delete('*/api/v1/me/readiness/:date', ({ params }) => {
      days = days.filter((d) => d.date !== String(params.date))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return puts
}

function renderCheckIn(onReview?: () => void) {
  render(
    <AuthContext.Provider value={auth}>
      <ReadinessCheckIn today="2026-11-01" onReview={onReview} />
    </AuthContext.Provider>,
  )
}

describe('Daily readiness', () => {
  it('saves to the account with optional detail, and a tired day offers the weekly review', async () => {
    const puts = account()
    const onReview = vi.fn()
    const user = userEvent.setup()
    renderCheckIn(onReview)
    await user.click(screen.getByText('How are you feeling today?'))
    await user.click(screen.getByText('Add sleep, soreness or a note'))
    await user.click(screen.getByRole('button', { name: 'Slept badly' }))
    await user.type(screen.getByLabelText('Note'), 'Late night')
    await user.click(screen.getByRole('button', { name: 'Tired' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Saved for today.')
    expect(puts).toEqual([{ date: '2026-11-01', body: { feeling: 'Tired', sleep: 'Poor', soreness: null, note: 'Late night' } }])
    expect(await screen.findByRole('button', { name: 'Tired' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Take it easier today/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Review this week →' }))
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('lists the last two weeks, changes an earlier day and clears one', async () => {
    const puts = account([
      { date: '2026-11-01', feeling: 'Unwell', sleep: null, soreness: null, note: null, updatedAt: '2026-11-01T06:00:00Z' },
      { date: '2026-10-30', feeling: 'Fresh', sleep: 'Good', soreness: 'None', note: null, updatedAt: '2026-10-30T06:00:00Z' },
    ])
    const user = userEvent.setup()
    renderCheckIn()
    await user.click(screen.getByText(/How are you feeling today\?/))
    // Unwell gets plain, safe guidance: rest, and when to see a doctor. No diagnosis.
    expect(await screen.findByText(/Rest today. Don’t run with a fever or chest symptoms/)).toBeVisible()
    const history = screen.getByRole('heading', { name: 'Last two weeks' }).parentElement!
    expect(within(history).getByText('Fresh · slept well · no soreness')).toBeVisible()

    await user.click(within(history).getByRole('button', { name: /Change Fri 30 Oct/ }))
    expect(screen.getByText(/Changing Fri 30 Oct/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Okay' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved for Fri 30 Oct.')
    expect(puts.at(-1)).toEqual({ date: '2026-10-30', body: { feeling: 'Okay', sleep: 'Good', soreness: 'None', note: null } })

    await user.click(within(history).getByRole('button', { name: 'Clear today' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cleared today.')
    expect(await screen.findByText(/How are you feeling today\?$/)).toBeInTheDocument()
  })
})
