import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from './TabBar'

describe('mobile navigation dock', () => {
  it('slides its indicator to the active tab and marks the current page', () => {
    const pick = vi.fn()
    const { rerender, container } = render(<TabBar current="home" onPick={pick} />)
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Home', 'Plan', 'Runs', 'Progress', 'Account'])
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('.tab-bar')?.getAttribute('style')).toContain('--active-tab: 0')

    rerender(<TabBar current="account" onPick={pick} />)
    expect(screen.getByRole('button', { name: 'Account' }).getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('.tab-bar')?.getAttribute('style')).toContain('--active-tab: 4')
    fireEvent.click(screen.getByRole('button', { name: 'Runs' }))
    expect(pick).toHaveBeenCalledWith('runs')
  })

  it('stands down the left as a rail on a desktop, with the same five places in the same order', () => {
    const { container } = render(<TabBar variant="rail" current="progress" onPick={() => {}} />)
    expect(container.querySelector('nav.tab-bar.tab-rail')).not.toBeNull()
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Home', 'Plan', 'Runs', 'Progress', 'Account'])
    expect(screen.getByRole('button', { name: 'Progress' }).getAttribute('aria-current')).toBe('page')
  })

  it('leaves out Plan and Progress until there is a plan', () => {
    const { container } = render(<TabBar current="runs" hasPlan={false} onPick={() => {}} />)
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Home', 'Runs', 'Account'])
    expect(container.querySelector('.tab-bar')?.getAttribute('style')).toContain('--tab-count: 3')
    expect(container.querySelector('.tab-bar')?.getAttribute('style')).toContain('--active-tab: 1')
  })

  it('does not show an active highlight when no tab is selected', () => {
    const { container } = render(<TabBar current={null} onPick={() => {}} />)
    expect(container.querySelector('.tab-bar-indicator')).toBeNull()
  })
})
