import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { WeekGlance } from './WeekGlance'
import { canMoveFrom, canMoveTo } from './move-window'

describe('reschedule from calendar drag', () => {
  it('routes a drop on another date to Move Run without changing the plan', () => {
    const week = planFixture.weeks.find(w => w.sessions.some(s => s.type !== 'Strength' && s.type !== 'Race'))!
    const from = week.sessions.find(s => s.type !== 'Strength' && s.type !== 'Race')!.date
    const target = from === week.startDate ? new Date(Date.parse(from + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10) : week.startDate
    const requestMove = vi.fn()
    const transfer = { setData: vi.fn(), getData: vi.fn(() => from), effectAllowed: 'move' }
    const { container } = render(<WeekGlance week={week} today={week.startDate} units="km" done={new Set()} onSelectDate={() => {}} onRequestMove={requestMove} />)
    const origin = container.querySelector<HTMLButtonElement>(`[data-date="${from}"]`)!
    const destination = container.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)!
    expect(origin.draggable).toBe(true)
    fireEvent.dragStart(origin, { dataTransfer: transfer })
    fireEvent.dragOver(destination, { dataTransfer: transfer })
    fireEvent.drop(destination, { dataTransfer: transfer })
    expect(requestMove).toHaveBeenCalledWith(from, target)
    expect(origin).toBeInTheDocument()
  })

  // Before the plan starts, a run in its first week can be moved (the server allows it); a run in a later week offers no
  // drag at all, so the runner never waits on a move that would be refused.
  it('offers drags only on runs the server will move, before the plan starts too', () => {
    const [first, second] = planFixture.weeks
    const today = new Date(Date.parse(first!.startDate + 'T12:00:00Z') - 2 * 86_400_000).toISOString().slice(0, 10)
    const props = { units: 'km' as const, done: new Set<string>(), onSelectDate: () => {}, onRequestMove: vi.fn(), today,
      canMoveFrom: (date: string) => canMoveFrom(planFixture, today, date), canMoveTo: (date: string) => canMoveTo(planFixture, today, date) }
    const run = (week: typeof first) => week!.sessions.find(s => s.type !== 'Strength' && s.type !== 'Race')!.date

    const { container, unmount } = render(<WeekGlance week={first!} {...props} />)
    expect(container.querySelector<HTMLButtonElement>(`[data-date="${run(first)}"]`)!.draggable).toBe(true)
    expect(container.querySelectorAll('.schedule-drag-handle').length).toBeGreaterThan(0)
    unmount()

    const later = render(<WeekGlance week={second!} {...props} />)
    expect(later.container.querySelector<HTMLButtonElement>(`[data-date="${run(second)}"]`)!.draggable).toBe(false)
    expect(later.container.querySelectorAll('.schedule-drag-handle')).toHaveLength(0)
  })
})
