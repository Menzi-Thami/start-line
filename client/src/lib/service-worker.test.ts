import { describe, expect, it, vi } from 'vitest'
import source from '../../public/sw.js?raw'

type Listener = (event: unknown) => void

/**
 * The worker as a browser runs it, with just what its push and notification handlers touch: where it was registered,
 * the notifications it shows, the windows it opens and the requests it makes.
 */
function worker(registeredAt = 'https://taperday.run/sw.js?api=https%3A%2F%2Fapi.taperday.test', answer = { ok: true }) {
  const listeners: Record<string, Listener> = {}
  const shown: { title: string; options: Record<string, unknown> }[] = []
  const fetch = vi.fn(async () => answer)
  const openWindow = vi.fn(async () => null)
  const self = {
    location: new URL(registeredAt),
    addEventListener: (type: string, listener: Listener) => (listeners[type] = listener),
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: { matchAll: async () => [], openWindow, claim: async () => undefined },
    skipWaiting: async () => undefined,
  }
  new Function('self', 'caches', 'fetch', source)(self, {}, fetch)

  const dispatch = async (type: string, event: object) => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]!({ ...event, waitUntil: (promise: Promise<unknown>) => (done = promise) })
    await done
  }
  return {
    shown,
    fetch,
    openWindow,
    push: (message: object) => dispatch('push', { data: { json: () => message } }),
    click: (options: Record<string, unknown>, action = '') =>
      dispatch('notificationclick', { action, notification: { close: () => undefined, data: options.data, tag: options.tag } }),
  }
}

const prompt = { title: 'Ran Tuesday’s Tempo?', body: 'A run from Strava matches it.', url: '/?view=home&tick=2026-10-20.Tempo', tag: 'tick-2026-10-20-Tempo', tick: 'the-key' }

describe('the service worker', () => {
  it('shows a "ran it?" prompt with a Tick it button, and a reminder without one', async () => {
    const sw = worker()

    await sw.push(prompt)
    await sw.push({ title: 'Today: Easy run', body: '6 km', url: '/?view=home', tag: 'reminder-2026-10-20' })

    expect(sw.shown[0]!.options).toMatchObject({ actions: [{ action: 'tick', title: 'Tick it' }], data: { url: prompt.url, tick: 'the-key' } })
    expect(sw.shown[1]!.options).not.toHaveProperty('actions')
    expect(sw.shown[1]!.options.data).toEqual({ url: '/?view=home' })
  })

  it('Tick it posts the key to the API it was registered with, and says it’s done', async () => {
    const sw = worker()
    await sw.push(prompt)

    await sw.click(sw.shown[0]!.options, 'tick')

    expect(sw.fetch).toHaveBeenCalledWith('https://api.taperday.test/api/v1/ticks', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'the-key' }) }))
    expect(sw.shown.at(-1)!.title).toBe('Ticked off')
    expect(sw.openWindow).not.toHaveBeenCalled()
  })

  it('opens the app on the session when the tick can’t be made, and on a plain tap', async () => {
    const sw = worker(undefined, { ok: false })
    await sw.push(prompt)

    await sw.click(sw.shown[0]!.options, 'tick')
    await sw.click(sw.shown[0]!.options)

    expect(sw.openWindow).toHaveBeenNthCalledWith(1, prompt.url)
    expect(sw.openWindow).toHaveBeenNthCalledWith(2, prompt.url)
    expect(sw.fetch).toHaveBeenCalledTimes(1)
  })

  it('never posts a key anywhere but https or its own host', async () => {
    const sw = worker('https://taperday.run/sw.js?api=http%3A%2F%2Fevil.test')
    await sw.push(prompt)

    await sw.click(sw.shown[0]!.options, 'tick')

    expect(sw.fetch).toHaveBeenCalledWith('https://taperday.run/api/v1/ticks', expect.anything())
  })
})
