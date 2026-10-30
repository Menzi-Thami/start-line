import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Session } from '../../lib/types'
import { SessionItem } from './WeekList'

const longRun = (overrides: Partial<Session>): Session => ({
  date: '2027-02-07',
  type: 'LongRun',
  title: 'Long run',
  detail: 'Steady and relaxed the whole way. Run/walk from the start: run 4 min, walk 30 s.',
  purpose: 'Builds the endurance that carries you to the finish.',
  distanceKm: 24,
  zone: 'LongRun',
  exercises: [],
  steps: [],
  ...overrides,
})

const renderSession = (session: Session) =>
  render(<SessionItem session={session} pace={undefined} units="km" done={new Set()} onDoneChange={() => {}} />)

describe('the run/walk chip', () => {
  it('shows the ratio as a watch would, on a session with run/walk', () => {
    renderSession(longRun({ runWalk: { runSeconds: 150, walkSeconds: 30 } }))

    // A screen reader hears what it is; everyone sees the two numbers to set on a watch.
    expect(screen.getByText(/Run 2:30 · Walk 0:30/).textContent).toBe('Run/walk from the start: Run 2:30 · Walk 0:30')
  })

  it('shows nothing on a session run all the way, or one saved before run/walk existed', () => {
    renderSession(longRun({ runWalk: null, detail: 'Steady and relaxed the whole way. Walk breaks are fine.' }))

    expect(screen.queryByText(/Walk 0:30/)).not.toBeInTheDocument()
  })
})
