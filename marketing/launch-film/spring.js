// Closed-form springs and easing for the film. Everything is a pure function of time: no timers, no state, no
// randomness, so any frame can be rendered on its own and in any order.

/**
 * Progress 0 → 1 of a damped spring (mass 1) released at t = 0. k is stiffness, c is damping.
 * Before release it holds at 0; it may overshoot 1 slightly when underdamped.
 */
export function spring(t, k = 170, c = 26) {
  if (t <= 0) return 0
  const w0 = Math.sqrt(k)
  const zeta = c / (2 * w0)
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1))
  const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1))
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1)
}

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x))
export const lerp = (a, b, p) => a + (b - a) * p
/** 0 → 1 across [a, b], clamped. */
export const ramp = (t, a, b) => clamp((t - a) / (b - a))
/** Smooth in-out for fades and camera drifts, where a spring would feel bouncy. */
export const ease = (p) => p * p * (3 - 2 * p)
export const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
