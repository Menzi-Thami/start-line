import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrollProgress } from './ScrollProgress'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('long-page navigation', () => {
  it.each([true, false])('returns focus to navigation and respects reduced motion (%s)', (reduced) => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1 })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(3000)
    const y = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced } as MediaQueryList)))
    const { container } = render(<><button className="wordmark-button">Taperday</button><ScrollProgress /></>)
    act(() => frame?.(0))
    expect(screen.queryByRole('button', { name: 'Back to top' })).toBeNull()
    y.mockReturnValue(1000)
    fireEvent.scroll(window)
    act(() => frame?.(0))
    expect((container.querySelector('.scroll-progress') as HTMLElement).style.transform).toBe('scaleX(0.5)')
    fireEvent.click(screen.getByRole('button', { name: 'Back to top' }))
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
    expect(screen.getByRole('button', { name: 'Taperday' })).toHaveFocus()
  })
})
