import { addDays, formatDistance, formatPaceRange, type Units } from './format'
import type { PaceZoneRange, TrainingPlan } from './types'

// RFC 5545 text escaping: backslash first, then the separators.
const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Lines longer than 75 octets must be folded onto continuation lines that start with a space.
function fold(line: string): string {
  const parts: string[] = []
  let rest = line
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  parts.push(rest)
  return parts.join('\r\n ')
}

const compactDate = (iso: string) => iso.replaceAll('-', '')

const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** One all-day event per session, so the plan sits in the runner's own calendar. */
export function buildIcs(plan: TrainingPlan, units: Units, now: Date = new Date()): string {
  const paces = new Map<string, PaceZoneRange>(plan.paces.map((p) => [p.zone, p]))
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taperday//Training plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']

  plan.weeks.forEach((week) =>
    week.sessions.forEach((session, index) => {
      const pace = session.zone ? paces.get(session.zone) : undefined
      const numbers = [
        session.distanceKm > 0 ? formatDistance(session.distanceKm, units) : null,
        pace ? formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units) : null,
      ].filter(Boolean)
      const summary = numbers.length > 0 ? `${session.title} · ${numbers.join(' at ')}` : session.title
      const description = `${session.detail}\n\nWhy: ${session.purpose}\n\nWeek ${week.number} of ${plan.weeks.length} for ${plan.race.name}.`

      lines.push(
        'BEGIN:VEVENT',
        `UID:${compactDate(session.date)}-${index}-${session.type.toLowerCase()}@taperday.run`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${compactDate(session.date)}`,
        `DTEND;VALUE=DATE:${compactDate(addDays(session.date, 1))}`,
        `SUMMARY:${escapeText(summary)}`,
        `DESCRIPTION:${escapeText(description)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      )
    }),
  )

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
