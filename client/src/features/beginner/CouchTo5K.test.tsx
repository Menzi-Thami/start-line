import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import { server } from '../../test/server'
import { CouchTo5K } from './CouchTo5K'

const account = { name: 'Thandi', email: 'thandi@example.test' }
const signedIn = { ...accountsOff, enabled: true, account, getToken: vi.fn(async () => 'test-token') }
const saved = {
  startedOn: '2026-11-02',
  days: ['Monday', 'Wednesday', 'Friday'],
  completed: ['0:1:1'],
  week: 1,
  paused: false,
  revision: 0,
  weekDelays: Array(9).fill(0),
  pausedOn: null,
}

beforeEach(() => {
  window.localStorage.clear()
  server.use(http.get('*/api/v1/me/beginner', () => HttpResponse.json(saved)))
})

describe('Couch to 5K account journey', () => {
  it('hydrates server progress and shows Week, Calendar and Progress without confusing recorded runs and confirmations', async () => {
    render(<AuthContext.Provider value={signedIn}><CouchTo5K /></AuthContext.Provider>)
    expect(await screen.findByText(/1 of 27 sessions confirmed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Calendar', exact: true }))
    expect(screen.getByRole('region', { name: 'Couch to 5K calendar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Week 2, from 2026-11-09/i }))
    expect(screen.getByText('Week 2 of 9')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Progress', exact: true }))
    expect(screen.getByRole('region', { name: 'Couch to 5K progress' })).toBeInTheDocument()
  })

  it('keeps account data out of anonymous device storage on sign-out', async () => {
    const { rerender } = render(<AuthContext.Provider value={signedIn}><CouchTo5K /></AuthContext.Provider>)
    expect(await screen.findByText(/1 of 27 sessions confirmed/)).toBeInTheDocument()
    rerender(<AuthContext.Provider value={accountsOff}><CouchTo5K /></AuthContext.Provider>)
    await waitFor(() => expect(screen.getByText(/0 of 27 sessions confirmed/)).toBeInTheDocument())
    await waitFor(() => expect(window.localStorage.getItem('taperday:beginner-progress:v1')).not.toContain('0:1:1'))
  })

  it('never automatically overwrites account progress with a device programme', async () => {
    window.localStorage.setItem('taperday:beginner-progress:v1', JSON.stringify({ ...saved, completed: ['0:2:1'] }))
    const writes: unknown[] = []
    server.use(
      http.get('*/api/v1/me/beginner', () => new HttpResponse(null, { status: 204 })),
      http.put('*/api/v1/me/beginner', async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json(writes.at(-1))
      }),
    )
    render(<AuthContext.Provider value={signedIn}><CouchTo5K /></AuthContext.Provider>)
    expect(await screen.findByRole('button', { name: 'Move my programme' })).toBeInTheDocument()
    expect(writes).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Move my programme' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ completed: ['0:2:1'] })
  })
})
