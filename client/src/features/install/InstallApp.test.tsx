import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setUpInstall } from '../../lib/install-app'
import { InstallCard, InstallSection } from './InstallApp'

beforeAll(() => setUpInstall())
afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const asIphone = () =>
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')

// These run in order: the browser's install offer, once it arrives, stays until it's used.
describe('adding Taperday to the home screen', () => {
  it('stays off Home where adding isn’t a tap or two, and Account’s one button says where the browser’s menu is', async () => {
    render(
      <>
        <InstallCard />
        <InstallSection />
      </>,
    )

    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add to home screen' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/choose Install app or Add to Home screen/)
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('on an iPhone, the one button opens the two taps with an arrow to Share, and Not now is remembered on this device', async () => {
    asIphone()
    const { unmount, container } = render(<InstallCard />)

    await userEvent.click(screen.getByRole('button', { name: 'Add to home screen' }))
    const guide = screen.getByRole('dialog', { name: 'Two taps and it’s on your home screen' })
    expect(guide).toHaveTextContent('Tap Share in the toolbar at the bottom')
    expect(guide).toHaveTextContent('Add to Home Screen')
    expect(container.querySelector('.install-guide-arrow')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()

    unmount()
    render(<InstallCard />)
    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()
  })

  it('asks again two weeks after Not now, and treats an old "never again" as expired', () => {
    asIphone()
    const twoWeeks = 14 * 24 * 60 * 60 * 1000
    const banner = () => screen.queryByRole('region', { name: 'Put Taperday on your home screen' })

    window.localStorage.setItem('startline:install-dismissed', new Date(Date.now() - twoWeeks + 60_000).toISOString())
    const { unmount } = render(<InstallCard />)
    expect(banner()).not.toBeInTheDocument()
    unmount()

    window.localStorage.setItem('startline:install-dismissed', new Date(Date.now() - twoWeeks - 60_000).toISOString())
    const second = render(<InstallCard />)
    expect(banner()).toBeInTheDocument()
    expect(screen.getByText(/full screen like an app/)).toBeInTheDocument()
    second.unmount()

    window.localStorage.setItem('startline:install-dismissed', '1')
    render(<InstallCard />)
    expect(banner()).toBeInTheDocument()
  })

  it('installs in one tap where the browser offers it, then says it’s on the home screen', async () => {
    const prompt = vi.fn(() => Promise.resolve())
    render(
      <>
        <InstallCard />
        <InstallSection />
      </>,
    )

    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) }))
    })
    const buttons = screen.getAllByRole('button', { name: 'Add to home screen' })
    expect(buttons).toHaveLength(2)
    await userEvent.click(buttons[0]!)

    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()
    expect(screen.getByText(/It’s on your home screen/)).toBeInTheDocument()
  })
})
