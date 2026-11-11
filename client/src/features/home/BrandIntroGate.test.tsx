import { fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrandIntroGate } from './BrandIntroGate'

beforeEach(() => {
  window.sessionStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') ? false : false }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
  vi.useRealTimers()
})

describe('the brand opening for signed-in runners', () => {
  it('plays for a signed-in runner even when the public film was already watched', () => {
    const done = vi.fn()
    const publicVisit = render(<BrandIntroGate audience="public" onFinished={done} />)
    expect(document.querySelector('.race-intro')).not.toBeNull()
    fireEvent.pointerDown(document)
    expect(document.querySelector('.race-intro')).toBeNull()
    publicVisit.unmount()

    const memberVisit = render(<BrandIntroGate audience="member" onFinished={done} />)
    expect(document.querySelector('.race-intro')).not.toBeNull()
    fireEvent.pointerDown(document)
    memberVisit.unmount()

    render(<BrandIntroGate audience="member" onFinished={done} />)
    expect(document.querySelector('.race-intro')).toBeNull()
    expect(done).toHaveBeenCalledTimes(2)
  })

  it('keeps the full runner film visible well beyond the old three-second cutoff', () => {
    vi.useFakeTimers()
    render(<BrandIntroGate audience="member" onFinished={() => {}} />)
    expect(screen.getByText('GO!')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3800))
    expect(document.querySelector('.race-intro')).not.toBeNull()
    act(() => vi.advanceTimersByTime(2400))
    expect(document.querySelector('.race-intro')).toBeNull()
  })

  it('respects reduced motion even when replay is requested', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    render(<BrandIntroGate audience="member" forceReplay onFinished={() => {}} />)
    expect(document.querySelector('.race-intro')).toBeNull()
  })
})
