import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api-client'

afterEach(() => vi.restoreAllMocks())

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
})
