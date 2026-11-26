import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAN_BUILD_TIMEOUT_MS, withPlanBuildDeadline } from './plan-build'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the complete plan-build handoff', () => {
  it('returns a finished plan without adding a decorative delay', async () => {
    const result = { id: 'synthetic-plan' }
    await expect(withPlanBuildDeadline(new AbortController().signal, async () => result)).resolves.toBe(result)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a generator that never responds and aborts its request', async () => {
    let signal: AbortSignal | undefined
    const operation = withPlanBuildDeadline(new AbortController().signal, async current => {
      signal = current
      return new Promise(() => {})
    })
    const failure = expect(operation).rejects.toMatchObject({ code: 'plan_build_timeout', status: 0 })
    await vi.advanceTimersByTimeAsync(PLAN_BUILD_TIMEOUT_MS)
    await failure
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('includes a stalled save after generation in the same deadline', async () => {
    const save = vi.fn(() => new Promise<void>(() => {}))
    const operation = withPlanBuildDeadline(new AbortController().signal, async () => {
      await Promise.resolve({ id: 'generated' })
      await save()
    })
    const failure = expect(operation).rejects.toMatchObject({ code: 'plan_build_timeout' })
    await vi.advanceTimersByTimeAsync(PLAN_BUILD_TIMEOUT_MS)
    await failure
    expect(save).toHaveBeenCalledOnce()
  })

  it('does not start an abandoned operation', async () => {
    const parent = new AbortController()
    const reason = new DOMException('Left the plan', 'AbortError')
    parent.abort(reason)
    const work = vi.fn(async () => 'unused')
    await expect(withPlanBuildDeadline(parent.signal, work)).rejects.toBe(reason)
    expect(work).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels pending work on navigation without reporting a deadline', async () => {
    const parent = new AbortController()
    let signal: AbortSignal | undefined
    const operation = withPlanBuildDeadline(parent.signal, async current => {
      signal = current
      return new Promise(() => {})
    })
    const reason = new DOMException('Changed page', 'AbortError')
    const failure = expect(operation).rejects.toBe(reason)
    await vi.advanceTimersByTimeAsync(1)
    parent.abort(reason)
    await failure
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves the real error and cancels remaining story/network work', async () => {
    const error = new Error('Synthetic generation failure')
    let signal: AbortSignal | undefined
    await expect(withPlanBuildDeadline(new AbortController().signal, async current => {
      signal = current
      throw error
    })).rejects.toBe(error)
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
