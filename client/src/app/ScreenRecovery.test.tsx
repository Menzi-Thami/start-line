import { lazy, Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenRecovery } from './ScreenRecovery'

afterEach(() => vi.restoreAllMocks())

describe('screen recovery', () => {
  it('recovers a rejected screen download while keeping navigation and saved inputs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    const MissingScreen = lazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    localStorage.setItem('startline:units', 'mi')
    window.history.replaceState(null, '', '/?view=runs')
    render(<><nav>Home navigation</nav><ScreenRecovery reload={reload}><Suspense fallback={<p>Loading</p>}><MissingScreen /></Suspense></ScreenRecovery></>)
    expect(await screen.findByRole('alert')).toHaveTextContent('This screen couldn’t load')
    expect(screen.getByRole('heading', { name: 'This screen couldn’t load' })).toHaveFocus()
    expect(screen.getByRole('navigation')).toHaveTextContent('Home navigation')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload this screen' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(localStorage.getItem('startline:units')).toBe('mi')
    expect(window.location.search).toBe('?view=runs')
  })

  it('starts clean when navigation mounts a different screen boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Broken = () => { throw new Error('screen failed') }
    const { rerender } = render(<ScreenRecovery key="runs"><Broken /></ScreenRecovery>)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    rerender(<ScreenRecovery key="account"><h2>Your account</h2></ScreenRecovery>)
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
