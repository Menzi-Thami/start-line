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
  it('stays off Home where adding isn’t a tap or two, and Account says how', () => {
    render(
      <>
        <InstallCard />
        <InstallSection />
      </>,
    )

    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()
    expect(screen.getByText(/choose Install app or Add to Home screen/)).toBeInTheDocument()
  })

  it('gives an iPhone the two Safari steps, and remembers Not now on this device', async () => {
    asIphone()
    const { unmount } = render(<InstallCard />)

    const card = screen.getByRole('region', { name: 'Put Taperday on your home screen' })
    expect(card).toHaveTextContent('In Safari, tap Share')
    expect(card).toHaveTextContent('Choose Add to Home Screen, then Add')
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()

    unmount()
    render(<InstallCard />)
    expect(screen.queryByRole('region', { name: 'Put Taperday on your home screen' })).not.toBeInTheDocument()
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
    expect(screen.getByText(/Taperday is on your home screen/)).toBeInTheDocument()
  })
})
