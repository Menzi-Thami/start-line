import { describe, expect, it } from 'vitest'
import type { CheckIn } from '../../lib/types'
import { planFixture } from '../../test/server'
import { sessionKey } from './plan-math'
import { dayStatus } from './training-status'

const session = planFixture.weeks[0]!.sessions[1]!
const answer = (status: CheckIn['status']) => [{ status, isAdditional: false } as CheckIn]
describe('training status separates attendance from execution', () => {
  it('prioritizes a runner’s partial or skipped answer over ticks and imports', () => {
    const done = new Set([sessionKey(session)])
    expect(dayStatus([session], done, answer('CutShort'), true, true).kind).toBe('partial')
    expect(dayStatus([session], done, answer('Skipped'), true, true).kind).toBe('skipped')
  })
  it('labels provisional evidence without a confirmation check', () => {
    const status = dayStatus([session], new Set([sessionKey(session)]), [], true, true)
    expect(status.label).toContain('provisional')
    expect(status.icon).not.toBe('✓')
  })
  it('keeps recorded rest days separate from completed prescriptions', () => {
    expect(dayStatus([], new Set(), [], true).kind).toBe('recorded')
    expect(dayStatus([], new Set(), [], false).kind).toBe('rest')
    expect(dayStatus([session], new Set(), [], false).kind).toBe('planned')
  })
})
