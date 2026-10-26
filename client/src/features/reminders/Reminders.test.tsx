import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type Auth } from '../../app/auth-context'
import { toBase64Url } from '../../lib/push'
import type { ReminderDevice, Reminders } from '../../lib/types'
import { remindersOff, server } from '../../test/server'
import { RemindersSection } from './Reminders'

const auth: Auth = {
  enabled: true,
  loading: false,
  account: { name: 'Thandi', email: 'thandi@example.com' },
  error: null,
  signIn: () => undefined,
  signUp: () => undefined,
  signOut: () => undefined,
  getToken: () => Promise.resolve('test-token'),
}

const PUBLIC_KEY_BYTES = new Uint8Array(65).fill(7)
PUBLIC_KEY_BYTES[0] = 4
const PUBLIC_KEY = toBase64Url(PUBLIC_KEY_BYTES.buffer)
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/this-phone'

const available: Reminders = { available: true, publicKey: PUBLIC_KEY, devices: [] }
// This phone's entry, known by the SHA-256 of ENDPOINT as the API works it out (worked out here, not by the app's code).
let thisPhone: ReminderDevice
beforeAll(async () => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ENDPOINT))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  thisPhone = { id: 'device-1', deviceKey: hash, remindAt: '06:15:00', weekAhead: false, createdAt: '2026-10-25T08:00:00Z' }
})

/** A browser that can take pushes: a service worker, its push manager and the Notification permission prompt. */
function pushCapableBrowser(permission: NotificationPermission = 'granted', subscribed = false) {
  let current: PushSubscription | null = null
  const unsubscribe = vi.fn(() => {
    current = null
    return Promise.resolve(true)
  })
  const makeSubscription = (key: BufferSource) =>
    ({
      endpoint: ENDPOINT,
      options: { applicationServerKey: key instanceof Uint8Array ? key.buffer : key, userVisibleOnly: true },
      getKey: (name: PushEncryptionKeyName) => new Uint8Array(name === 'p256dh' ? 65 : 16).fill(1).buffer,
      unsubscribe,
    }) as unknown as PushSubscription
  if (subscribed) current = makeSubscription(PUBLIC_KEY_BYTES)
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(current)),
    subscribe: vi.fn((options: PushSubscriptionOptionsInit) => {
      current = makeSubscription(options.applicationServerKey as BufferSource)
      return Promise.resolve(current)
    }),
  }
  const requestPermission = vi.fn(() => Promise.resolve(permission))
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { permission: 'default', requestPermission })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: () => Promise.resolve({ pushManager }) },
  })
  return { pushManager, requestPermission, unsubscribe }
}

function section(reminders: Reminders) {
  const puts: unknown[] = []
  const deletes: string[] = []
  server.use(
    http.get('*/api/v1/me/reminders', () => HttpResponse.json(reminders)),
    http.put('*/api/v1/me/reminders/devices', async ({ request }) => {
      const body = (await request.json()) as { remindAt: string; weekAhead: boolean }
      puts.push(body)
      return HttpResponse.json({ ...thisPhone, remindAt: body.remindAt, weekAhead: body.weekAhead })
    }),
    http.delete('*/api/v1/me/reminders/devices/:id', ({ params }) => {
      deletes.push(String(params.id))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const view = render(
    <AuthContext.Provider value={auth}>
      <RemindersSection />
    </AuthContext.Provider>,
  )
  return { ...view, puts, deletes }
}

beforeEach(() => {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('reminders in Account', () => {
  it('stays hidden until push is configured on the server', async () => {
    pushCapableBrowser()
    const { container } = section(remindersOff)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('is off by default, and turning it on asks permission, subscribes and saves the time chosen', async () => {
    const { pushManager, requestPermission } = pushCapableBrowser()
    const { puts } = section(available)

    const toggle = await screen.findByRole('switch', { name: 'Reminders on this device' })
    expect(toggle).not.toBeChecked()
    expect(screen.getByText(/asks whether to tick it.+never includes your recorded runs\./s)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '06:30' } })
    expect(puts).toHaveLength(0)
    await userEvent.click(toggle)

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Reminders on this device' })).toBeChecked())
    expect(requestPermission).toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: PUBLIC_KEY_BYTES })
    expect(puts).toEqual([
      {
        endpoint: ENDPOINT,
        // 65 and 16 bytes of 1s, base64url.
        p256dh: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
        auth: 'AQEBAQEBAQEBAQEBAQEBAQ',
        remindAt: '06:30:00',
        weekAhead: true,
      },
    ])
    expect(screen.getByRole('status')).toHaveTextContent('Reminders are on. The next one comes at 06:30')
  })

  it('knows this device is on, saves a new time or choice straight away, and turning off forgets it', async () => {
    const { unsubscribe } = pushCapableBrowser('granted', true)
    const { puts, deletes } = section({ ...available, devices: [thisPhone] })

    const toggle = await screen.findByRole('switch', { name: 'Reminders on this device' })
    await waitFor(() => expect(toggle).toBeChecked())
    expect(screen.getByLabelText('Time')).toHaveValue('06:15')
    expect(screen.getByRole('checkbox', { name: 'On Mondays, tell me when a new week starts' })).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '05:45' } })
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ endpoint: ENDPOINT, remindAt: '05:45:00', weekAhead: false })
    await userEvent.click(screen.getByRole('checkbox', { name: 'On Mondays, tell me when a new week starts' }))
    await waitFor(() => expect(puts).toHaveLength(2))
    expect(puts[1]).toMatchObject({ remindAt: '05:45:00', weekAhead: true })

    await userEvent.click(screen.getByRole('switch', { name: 'Reminders on this device' }))

    await waitFor(() => expect(deletes).toEqual(['device-1']))
    expect(unsubscribe).toHaveBeenCalled()
    expect(screen.getByRole('switch', { name: 'Reminders on this device' })).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Reminders are off, and Taperday has forgotten this device.')
  })

  it('says how to allow notifications when the runner blocks them, and sends nothing', async () => {
    const { pushManager } = pushCapableBrowser('denied')
    const { puts } = section(available)

    await userEvent.click(await screen.findByRole('switch', { name: 'Reminders on this device' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications are blocked for Taperday')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(puts).toHaveLength(0)
    expect(screen.getByRole('switch', { name: 'Reminders on this device' })).not.toBeChecked()
  })

  it('tells an iPhone in Safari to add Taperday to the home screen first', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    )
    pushCapableBrowser()
    section(available)

    expect(await screen.findByText(/reminders work once Taperday is on your home screen \(iOS 16\.4 or later\)/)).toBeInTheDocument()
    expect(screen.getByText(/On Android and on a computer, they work in the browser/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('says so when the browser can’t show notifications at all', async () => {
    section(available)

    expect(await screen.findByText(/This browser can’t show notifications from websites/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
