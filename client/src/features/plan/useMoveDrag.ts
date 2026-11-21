import { useRef, useState, type DragEvent, type TouchEvent } from 'react'

/** How far a finger travels from the drag handle before it counts as a drag rather than a tap. */
export const TOUCH_DRAG_DISTANCE = 12

type Drag = { from: string; over: string | null }

const dayAt = (x: number, y: number) =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-date]')?.dataset.date ?? null

/**
 * Dragging a run to another day, by finger (the ⠿ handle) or mouse (the day itself). It starts as soon as the finger moves:
 * no hold first, because a quick flick from one day to the next takes about 300 ms and an earlier 450 ms hold silently
 * ignored it (owner's staging QA, 21 Nov 2026). While dragging, the run being moved and the day it would land on are marked
 * (`data-dragging`, `data-drop-target`), so the runner can see it working before they let go.
 */
export function useMoveDrag(canDrop: (date: string) => boolean, onDrop?: (from: string, to: string) => void) {
  const touch = useRef<{ date: string; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const target = (from: string, date: string | null) => (date && date !== from && canDrop(date) ? date : null)
  const show = (from: string, over: string | null) =>
    setDrag(current => (current?.from === from && current.over === over ? current : { from, over }))

  const handle = (date: string) => ({
    onTouchStart: (event: TouchEvent) => {
      const point = event.touches[0]
      if (point) touch.current = { date, x: point.clientX, y: point.clientY }
    },
    onTouchMove: (event: TouchEvent) => {
      const start = touch.current
      const point = event.touches[0]
      if (!start || !point) return
      if (!drag && Math.hypot(point.clientX - start.x, point.clientY - start.y) < TOUCH_DRAG_DISTANCE) return
      show(start.date, target(start.date, dayAt(point.clientX, point.clientY)))
    },
    onTouchEnd: (event: TouchEvent) => {
      const start = touch.current
      touch.current = null
      setDrag(null)
      const point = event.changedTouches[0]
      if (!start || !point || Math.hypot(point.clientX - start.x, point.clientY - start.y) < TOUCH_DRAG_DISTANCE) return
      const to = target(start.date, dayAt(point.clientX, point.clientY))
      if (!to) return
      // The finger lifts over another day: don't let that tap open it as well.
      event.stopPropagation()
      event.preventDefault()
      onDrop?.(start.date, to)
    },
    onTouchCancel: () => {
      touch.current = null
      setDrag(null)
    },
  })

  const day = (date: string) => ({
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData('text/plain', date)
      event.dataTransfer.effectAllowed = 'move'
      show(date, null)
    },
    onDragOver: (event: DragEvent) => {
      if (!canDrop(date)) return
      event.preventDefault()
      if (drag) show(drag.from, target(drag.from, date))
    },
    onDragEnd: () => setDrag(null),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      setDrag(null)
      const from = event.dataTransfer.getData('text/plain')
      if (from && from !== date && canDrop(date)) onDrop?.(from, date)
    },
    'data-dragging': drag?.from === date || undefined,
    'data-drop-target': drag?.over === date || undefined,
  })

  return { handle, day }
}
