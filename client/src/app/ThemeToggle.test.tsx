import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyStoredTheme } from '../lib/theme'
import { ThemeToggle } from './ThemeToggle'

const installed = (yes: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: yes && query === '(display-mode: standalone)', media: query, addEventListener() {}, removeEventListener() {} }))

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('the dark mode switch', () => {
  it('switches the website to dark and back, and remembers the choice', async () => {
    installed(false)
    const user = userEvent.setup()
    render(<ThemeToggle />)
    const toggle = screen.getByRole('button', { name: 'Dark mode' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('taperday:theme')).toBe('dark')

    await user.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('is offered in the installed app and remembers the chosen theme across starts', async () => {
    installed(true)
    const user = userEvent.setup()
    const { unmount } = render(<ThemeToggle />)
    const toggle = screen.getByRole('button', { name: 'Dark mode' })
    await user.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('dark')
    unmount()
    delete document.documentElement.dataset.theme
    applyStoredTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Dark mode' }))
    expect(window.localStorage.getItem('taperday:theme')).toBe('light')
  })
})
