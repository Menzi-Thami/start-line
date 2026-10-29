import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { PlanView } from './PlanView'

const view = () =>
  render(<PlanView plan={planFixture} units="km" onUnitsChange={() => undefined} shareUrl="https://taperday.run/x" today="2026-10-01" />)

// jsdom has no layout, so give the row and its tabs the measurements a phone would: a 360px row, with the tabs laid
// out one after another from the start of the row and the last ones beyond its edge.
const layOut = (list: HTMLElement) => {
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')]
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 360, width: 360 } as DOMRect)
  tabs.forEach((tab, i) => vi.spyOn(tab, 'getBoundingClientRect').mockReturnValue({ left: i * 200, right: i * 200 + 90, width: 90 } as DOMRect))
  Object.defineProperty(list, 'clientWidth', { configurable: true, value: 360 })
  Object.defineProperty(list, 'scrollWidth', { configurable: true, value: 500 })
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (Element.prototype as { scrollBy?: unknown }).scrollBy
})

describe('the plan’s tab row on a narrow screen', () => {
  it('scrolls a chosen tab into view when it was hidden at the edge', async () => {
    const scrollBy = vi.fn()
    Element.prototype.scrollBy = scrollBy
    view()
    const list = screen.getByRole('tablist', { name: 'Your plan' })
    layOut(list)

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Progress' }))

    // The last tab spans 400-490 in a 360px row, so it needs 490 - (360 - 28) = 158px more, and no animation under test.
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 158, behavior: 'auto' })
  })

  it('leaves the row alone when the chosen tab is already in view', async () => {
    const scrollBy = vi.fn()
    Element.prototype.scrollBy = scrollBy
    view()
    layOut(screen.getByRole('tablist', { name: 'Your plan' }))

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Calendar' }))

    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('fades the edge with more tabs beyond it, and only while there are some', () => {
    view()
    const list = screen.getByRole('tablist', { name: 'Your plan' })
    expect(list).toHaveAttribute('data-fade', 'none')

    layOut(list)
    list.scrollLeft = 0
    fireEvent.scroll(list)
    expect(list).toHaveAttribute('data-fade', 'end')

    list.scrollLeft = 70
    fireEvent.scroll(list)
    expect(list).toHaveAttribute('data-fade', 'both')

    list.scrollLeft = 140
    fireEvent.scroll(list)
    expect(list).toHaveAttribute('data-fade', 'start')
  })

  it('keeps every tab reachable by keyboard, as a single tab stop', async () => {
    view()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1)

    tabs[0]!.focus()
    await userEvent.setup().keyboard('{End}')
    expect(tabs.at(-1)).toHaveFocus()
    expect(tabs.at(-1)).toHaveAttribute('aria-selected', 'true')
  })
})
