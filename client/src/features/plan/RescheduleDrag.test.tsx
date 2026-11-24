import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { WeekGlance } from './WeekGlance'
import { canMoveFrom, canMoveTo } from './move-window'

const runWeek = () => {
  const week = planFixture.weeks.find(w => w.sessions.some(s => s.type !== 'Strength' && s.type !== 'Race'))!
  const from = week.sessions.find(s => s.type !== 'Strength' && s.type !== 'Race')!.date
  const target = from === week.startDate ? new Date(Date.parse(from + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10) : week.startDate
  return { week, from, target }
}
const at = (x: number, y: number) => [{ clientX: x, clientY: y }]

describe('reschedule from calendar drag', () => {
  it('opens the same move flow from a named button without needing to drag', () => {
    const { week, from } = runWeek()
    const requestMove = vi.fn()
    render(<WeekGlance week={week} today={week.startDate} units="km" done={new Set()} onSelectDate={vi.fn()} onRequestMove={requestMove} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Move .+ from / })[0]!)
    expect(requestMove).toHaveBeenCalledOnce()
    expect(requestMove).toHaveBeenCalledWith(from)
  })
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

  // Staging QA, 21 Nov 2026: a quick finger drag from one day to the next (about 300 ms) did nothing, because a drag only
  // counted after a 450 ms hold, and nothing showed it was working. Now it starts as soon as the finger moves.
  describe('by finger, on the handle', () => {
    afterEach(() => { Reflect.deleteProperty(document, 'elementFromPoint') })

    const setUp = () => {
      const { week, from, target } = runWeek()
      const requestMove = vi.fn()
      const view = render(<WeekGlance week={week} today={week.startDate} units="km" done={new Set()} onSelectDate={() => {}} onRequestMove={requestMove} />)
      const origin = view.container.querySelector<HTMLButtonElement>(`[data-date="${from}"]`)!
      const destination = view.container.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)!
      const handle = origin.querySelector<HTMLElement>('.schedule-drag-handle')!
      let under: Element = origin
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => under })
      return { from, target, requestMove, origin, destination, handle, over: (element: Element) => { under = element } }
    }

    it('moves on a quick drag, with no hold first, and shows where the run will land while dragging', () => {
      const { from, target, requestMove, origin, destination, handle, over } = setUp()
      fireEvent.touchStart(handle, { touches: at(10, 10) })
      over(destination)
      fireEvent.touchMove(handle, { touches: at(80, 12) })
      expect(origin).toHaveAttribute('data-dragging')
      expect(destination).toHaveAttribute('data-drop-target')
      fireEvent.touchEnd(handle, { changedTouches: at(80, 12) })
      expect(requestMove).toHaveBeenCalledWith(from, target)
      expect(origin).not.toHaveAttribute('data-dragging')
      expect(destination).not.toHaveAttribute('data-drop-target')
    })

    it('treats a touch that barely moves as a tap, not a move', () => {
      const { requestMove, handle, destination, over } = setUp()
      fireEvent.touchStart(handle, { touches: at(10, 10) })
      over(destination)
      fireEvent.touchMove(handle, { touches: at(14, 12) })
      expect(destination).not.toHaveAttribute('data-drop-target')
      fireEvent.touchEnd(handle, { changedTouches: at(14, 12) })
      expect(requestMove).not.toHaveBeenCalled()
    })

    it('never marks or drops on a day the run cannot move to', () => {
      const { week, from, target } = runWeek()
      const requestMove = vi.fn()
      const { container } = render(<WeekGlance week={week} today={week.startDate} units="km" done={new Set()} onSelectDate={() => {}} onRequestMove={requestMove} canMoveTo={date => date !== target} />)
      const handle = container.querySelector<HTMLElement>(`[data-date="${from}"] .schedule-drag-handle`)!
      const destination = container.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)!
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => destination })
      fireEvent.touchStart(handle, { touches: at(10, 10) })
      fireEvent.touchMove(handle, { touches: at(80, 12) })
      expect(destination).not.toHaveAttribute('data-drop-target')
      fireEvent.touchEnd(handle, { changedTouches: at(80, 12) })
      expect(requestMove).not.toHaveBeenCalled()
    })
  })
})
