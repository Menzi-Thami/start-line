import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, READ_TIMEOUT_MS, RETRY_AFTER_MS, WRITE_TIMEOUT_MS } from './api-client'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('request cancellation and Safari transport errors', () => {
  it('recovers a Safari AbortError when no caller cancelled the read', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new DOMException('Fetch is aborted', 'AbortError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'runner' }), { status: 200 }))
    await expect(api.me.get('test-token')).resolves.toEqual({ id: 'runner' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('normalises Safari deadline aborts into a recoverable timeout', async () => {
    const deadline = new AbortController()
    deadline.abort(new DOMException('Deadline reached', 'TimeoutError'))
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Fetch is aborted', 'AbortError'))
    await expect(api.me.get('test-token')).rejects.toMatchObject({ name: 'ApiError', status: 0, code: 'request_timeout' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('recovers when cancellation occurs while reading the response body', async () => {
    const response = new Response('{}', { status: 200 })
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('Fetch is aborted', 'AbortError'))
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
    await expect(api.me.get('test-token')).rejects.toMatchObject({ name: 'ApiError', status: 0 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('preserves explicit caller cancellation without retrying', async () => {
    const controller = new AbortController()
    const cancelled = new DOMException('Search cancelled', 'AbortError')
    controller.abort(cancelled)
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(cancelled)
    await expect(api.searchRaces('local', controller.signal)).rejects.toBe(cancelled)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('never automatically retries a write after an ambiguous transport abort', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Fetch is aborted', 'AbortError'))
    await expect(api.me.journey.endMaintenance('test-token')).rejects.toMatchObject({ name: 'ApiError', status: 0 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('recovers a malformed read response without showing a raw parser error', async () => {
    const unreadable = new Response('not-json', { status: 200 })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(unreadable)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'runner' }), { status: 200 }))
    await expect(api.me.get('test-token')).resolves.toEqual({ id: 'runner' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not replay a write whose successful response was unreadable', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('internal-debug-sentinel', { status: 200 }))
    await expect(api.me.journey.endMaintenance('test-token')).rejects.toMatchObject({
      code: 'invalid_response', status: 0, message: 'We couldn’t confirm that change. Check your saved data before trying again.',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('bounds a stalled write in older Safari without automatically replaying it', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AbortSignal', {})
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
    }))
    const operation = api.me.journey.endMaintenance('test-token')
    const failure = expect(operation).rejects.toMatchObject({ code: 'request_timeout', status: 0 })
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS)
    await failure
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds both attempts of a stalled read when native timeout composition is unavailable', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AbortSignal', {})
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
    }))
    const operation = api.me.get('test-token')
    const failure = expect(operation).rejects.toMatchObject({ code: 'request_timeout', status: 0 })
    const started = Date.now()
    await vi.runAllTimersAsync()
    await failure
    expect(Date.now() - started).toBeLessThanOrEqual(READ_TIMEOUT_MS * 2 + RETRY_AFTER_MS + 1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
