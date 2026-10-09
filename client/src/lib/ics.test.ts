import { describe, expect, it } from 'vitest'
import { planFixture } from '../test/server'
import { buildIcs } from './ics'

const now = new Date('2026-10-08T09:00:00Z')

describe('calendar export', () => {
  const ics = buildIcs(planFixture, 'km', now)
  const sessions = planFixture.weeks.flatMap((w) => w.sessions)

  it('creates one all-day event per session', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(sessions.length)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261213')
  })

  it('uses CRLF line endings throughout', () => {
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/)
  })

  it('folds long lines at 75 octets', () => {
    const longest = Math.max(...ics.split('\r\n').map((l) => new TextEncoder().encode(l).length))
    expect(longest).toBeLessThanOrEqual(75)
  })

  it('escapes commas, semicolons and newlines in text', () => {
    const tricky = {
      ...planFixture,
      weeks: [{ ...planFixture.weeks[0]!, sessions: [{ ...planFixture.weeks[0]!.sessions[0]!, title: 'Hills, then; more' }] }],
    }
    expect(buildIcs(tricky, 'km', now)).toContain('SUMMARY:Hills\\, then\\; more')
  })

  it('writes distances and paces in the chosen units', () => {
    expect(buildIcs(planFixture, 'mi', now)).toMatch(/\/mi/)
  })
})
