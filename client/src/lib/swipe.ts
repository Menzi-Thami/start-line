/** Only intentional horizontal gestures count; vertical page scrolling stays native. */
export function horizontalSwipe(start: { x: number; y: number }, end: { x: number; y: number }, threshold = 64): -1 | 0 | 1 {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.8) return 0
  return dx < 0 ? 1 : -1
}
/** Native controls and horizontally scrollable content keep their own touch gestures. */
export function allowsSwipe(target: EventTarget | null): boolean {
  return !(target instanceof Element && target.closest('button, a, input, select, textarea, summary, [contenteditable], [role="slider"], .plan-calendar, .home-chart'))
}

