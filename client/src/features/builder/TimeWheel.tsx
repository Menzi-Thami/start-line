import { useEffect, useRef } from 'react'

/** Height of one number on the wheel, in pixels: a comfortable finger target. app.css sizes rows the same (--wheel-row). */
export const WHEEL_ROW = 44

/** How long the wheel rests before the number under the line counts, so a flick can finish spinning first. */
export const WHEEL_SETTLE_MS = 150

interface Props {
  id: string
  label: string
  /** The short unit shown beside the chosen number ("hr", "min", "sec"); the label is what's read out. */
  unit?: string
  /** The digits as typed: "" when nothing is chosen yet. */
  value: string
  max: number
  onChange: (value: string) => void
  invalid?: boolean
  describedBy?: string
}

/**
 * One wheel of numbers, 0 to <paramref name="max"/>, that snaps to the line in the middle, like a phone's time picker:
 * flick it with a finger, scroll it, or tap a number. Underneath it is the field itself (visually hidden): it holds the
 * value, takes typing and the arrow keys, and is what a screen reader sees, so the wheel is only ever a faster way to set
 * it. A tap never focuses that field, so it never brings up a phone's keyboard.
 */
export function TimeWheel({ id, label, unit = label, value, max, onChange, invalid, describedBy }: Props) {
  const track = useRef<HTMLDivElement>(null)
  // Set while the wheel moves itself (to show a value set some other way), so that move never picks a number.
  const moving = useRef(false)
  const settle = useRef<number | undefined>(undefined)
  const selected = value === '' ? null : Number(value)

  const moveTo = (n: number) => {
    const wheel = track.current
    if (!wheel) return
    const target = n * WHEEL_ROW
    if (Math.abs(wheel.scrollTop - target) < 1) return
    moving.current = true
    wheel.scrollTop = target
  }

  // Show the value on the line whenever it changes: typed, tapped, set by an estimate, or reset.
  useEffect(() => moveTo(selected ?? 0), [selected])

  useEffect(() => () => window.clearTimeout(settle.current), [])

  const choose = (n: number) => onChange(String(Math.max(0, Math.min(max, n))))

  // Every scroll, a finger's, a mouse wheel's or the wheel's own, ends the same way: once it rests, the number on the
  // line counts, unless the wheel moved itself.
  const onScroll = () => {
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const wheel = track.current
      if (!wheel) return
      if (moving.current) {
        moving.current = false
        return
      }
      const n = Math.max(0, Math.min(max, Math.round(wheel.scrollTop / WHEEL_ROW)))
      if (n !== selected) choose(n)
      else moveTo(n) // back onto the line if it came to rest between two numbers
    }, WHEEL_SETTLE_MS)
  }

  return (
    <div className={`wheel${invalid ? ' is-invalid' : ''}`}>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <div className="wheel-window">
        <div ref={track} className="wheel-track" aria-hidden="true" onScroll={onScroll}>
          <span className="wheel-pad" />
          {Array.from({ length: max + 1 }, (_, n) => (
            <span key={n} className={`wheel-item${n === selected ? ' is-selected' : ''}`} onClick={() => choose(n)}>
              {String(n).padStart(2, '0')}
            </span>
          ))}
          <span className="wheel-pad" />
        </div>
        <input
          id={id}
          className="visually-hidden wheel-input"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={value}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 2)
            onChange(digits === '' ? '' : String(Math.min(Number(digits), max)))
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
            e.preventDefault()
            choose((selected ?? 0) + (e.key === 'ArrowUp' ? 1 : -1))
          }}
        />
      </div>
      <span className="wheel-unit" aria-hidden="true">
        {unit}
      </span>
    </div>
  )
}
