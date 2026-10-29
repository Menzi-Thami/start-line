import type { KeyboardEvent } from 'react'
import type { Session } from '../../lib/types'
import { sessionKey } from './plan-math'

/** Recording an activity and completing a prescription are separate facts. */
export function calendarDayState(sessions: readonly Session[], done: ReadonlySet<string>, recorded: boolean, date: string, today: string) {
  if (sessions.length > 0 && sessions.every(session => done.has(sessionKey(session)))) return 'done'
  if (sessions.length === 0) return recorded ? 'done' : 'rest'
  return date < today ? 'missed' : 'ahead'
}

/** Each calendar keeps date navigation inside its own buttons. */
export function moveCalendarFocus(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.week-day-button, .plan-calendar-day')]
  const current = buttons.indexOf(event.target as HTMLButtonElement)
  if (current < 0) return
  event.preventDefault()
  const row = event.currentTarget.classList.contains('week-agenda') ? 1 : 7
  const delta = event.key === 'ArrowDown' ? row : event.key === 'ArrowUp' ? -row : event.key === 'ArrowRight' ? 1 : -1
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + delta))
  buttons[next]?.focus()
}
