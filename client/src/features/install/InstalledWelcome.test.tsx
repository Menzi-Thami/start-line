import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallCard } from './InstallApp'

// Running from the home screen, with notifications not yet decided.
const showNotification = vi.fn(() => Promise.resolve())
let permission: NotificationPermission = 'default'

beforeEach(() => {
  permission = 'default'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('standalone'), addEventListener: () => {}, removeEventListener: () => {} }))
  // A live getter, so the page sees permission change once it's granted.
  const notification = Object.defineProperty(function Notification() {}, 'permission', { get: () => permission })
  vi.stubGlobal(
    'Notification',
    Object.assign(notification, {
      requestPermission: vi.fn(() => {
        permission = 'granted'
        return Promise.resolve('granted' as NotificationPermission)
      }),
    }),
  )
  const registration = { showNotification }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration) } })
  vi.stubGlobal('PushManager', function PushManager() {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  showNotification.mockClear()
  window.localStorage.clear()
})

describe('the first time Taperday opens from the home screen', () => {
  it('says hello, and one tap allows notifications and sends the welcome', async () => {
    render(<InstallCard />)

    expect(screen.getByRole('region', { name: 'You’re all set' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }))

    expect(showNotification).toHaveBeenCalledWith('Taperday is on your home screen', expect.objectContaining({ tag: 'taperday-welcome' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Sign in to get reminders')
  })

  it('goes once dismissed, and stays gone on this device', async () => {
    const { unmount } = render(<InstallCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'You’re all set' })).not.toBeInTheDocument()

    unmount()
    render(<InstallCard />)
    expect(screen.queryByRole('region', { name: 'You’re all set' })).not.toBeInTheDocument()
  })
})
