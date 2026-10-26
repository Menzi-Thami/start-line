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
