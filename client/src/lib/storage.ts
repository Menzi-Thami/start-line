// Per-device conveniences only: ticked-off sessions and the units preference. Storage can be
// blocked or wiped (private windows, strict settings), so every access is guarded and the app
// works the same without it.

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the tick simply won't be remembered on this device.
  }
}

export function loadDone(planKey: string): Set<string> {
  const raw = read(`startline:done:${planKey}`)
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveDone(planKey: string, done: Set<string>): void {
  write(`startline:done:${planKey}`, JSON.stringify([...done]))
}

export function loadUnits(): 'km' | 'mi' {
  return read('startline:units') === 'mi' ? 'mi' : 'km'
}

export function saveUnits(units: 'km' | 'mi'): void {
  write('startline:units', units)
}

/** How long "Not now" to adding Taperday to the home screen lasts on this device, before the banner asks again. */
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Whether the runner said "Not now" to adding Taperday to their home screen on this device in the last two weeks.
 * Account always offers it. An older "never again" answer (no date) counts as expired, so the banner asks once more.
 */
export function loadInstallDismissed(now: Date = new Date()): boolean {
  const at = Date.parse(read('startline:install-dismissed') ?? '')
  return Number.isFinite(at) && now.getTime() - at >= 0 && now.getTime() - at < INSTALL_SNOOZE_MS
}

export function saveInstallDismissed(now: Date = new Date()): void {
  write('startline:install-dismissed', now.toISOString())
}
