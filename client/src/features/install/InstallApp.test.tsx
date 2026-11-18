import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setUpInstall } from '../../lib/install-app'
import { InstallSection } from './InstallApp'

beforeAll(() => setUpInstall())
afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const asIphone = () =>
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')

// These run in order: the browser's install offer, once it arrives, stays until it's used.
describe('adding Taperday to the home screen from Account', () => {
  it('says where the browser’s menu is when adding isn’t one tap', async () => {
    render(<InstallSection />)

    await userEvent.click(screen.getByRole('button', { name: 'Add to home screen' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/choose Install app or Add to Home screen/)
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('on an iPhone, opens the two taps with an arrow to Share', async () => {
    asIphone()
    const { container } = render(<InstallSection />)

    await userEvent.click(screen.getByRole('button', { name: 'Add to home screen' }))
    const guide = screen.getByRole('dialog', { name: 'Two taps and it’s on your home screen' })
    expect(guide).toHaveTextContent('Tap Share in the toolbar at the bottom')
    expect(guide).toHaveTextContent('Add to Home Screen')
    expect(container.querySelector('.install-guide-arrow')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('installs in one tap where the browser offers it, then says it’s on the home screen', async () => {
    const prompt = vi.fn(() => Promise.resolve())
    render(<InstallSection />)

    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) }))
    })
    await userEvent.click(screen.getByRole('button', { name: 'Add to home screen' }))

    expect(prompt).toHaveBeenCalled()
    expect(screen.getByText(/It’s on your home screen/)).toBeInTheDocument()
  })
})
