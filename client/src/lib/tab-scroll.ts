// The plan's tab row scrolls sideways on a narrow screen. Two pure helpers keep that readable: where to scroll so the
// selected tab isn't hidden, and which edges have more tabs beyond them (so the row can fade there).

export type TabFade = 'none' | 'start' | 'end' | 'both'

/** How much of the row the edge fade covers. A selected tab is kept clear of it. */
export const TAB_FADE_PX = 28

interface Span {
  left: number
  right: number
}

/**
 * How far to scroll the row (positive is towards the end) so the tab sits clear of the edge fades. Zero when it already
 * does, so choosing a tab that's in view never nudges the row. A row that can't scroll further just stops at its end.
 */
export function revealDelta(list: Span, tab: Span, margin = TAB_FADE_PX): number {
  const hiddenAtStart = list.left + margin - tab.left
  if (hiddenAtStart > 0) return -hiddenAtStart
  const hiddenAtEnd = tab.right - (list.right - margin)
  return hiddenAtEnd > 0 ? hiddenAtEnd : 0
}

/** Which edges of the row have more tabs past them. A pixel or two of slack covers sub-pixel scroll positions. */
export function tabFade(scrollLeft: number, clientWidth: number, scrollWidth: number, slack = 2): TabFade {
  const more = scrollWidth - clientWidth > slack
  if (!more) return 'none'
  const atStart = scrollLeft <= slack
  const atEnd = scrollLeft + clientWidth >= scrollWidth - slack
  if (atStart) return 'end'
  return atEnd ? 'start' : 'both'
}
