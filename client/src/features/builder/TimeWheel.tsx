import { useEffect, useRef } from 'react'

/** Height of one number on the wheel, in pixels; app.css sizes rows with the same value (--wheel-row). */
export const WHEEL_ROW = 36

/** How long the wheel rests before the number under the line counts, so a flick can finish spinning first. */
export const WHEEL_SETTLE_MS = 120

interface Props {
  id: string
  label: string
  /** The digits as typed: "" when nothing is chosen yet. */
  value: string
  max: number
  onChange: (value: string) => void
  invalid?: boolean
  describedBy?: string
}

/**
 * One wheel of numbers, 0 to <paramref name="max"/>, that snaps to the line in the middle, like a phone's time picker:
 * flick it, or tap a number. Underneath it is the field itself (visually hidden): it holds the value, takes typing and
 * the arrow keys, and is what a screen reader sees, so the wheel is only ever a faster way to set it.
 */
export function TimeWheel({ id, label, value, max, onChange, invalid, describedBy }: Props) {
  const track = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const turning = useRef(false)
  const settle = useRef<number | undefined>(undefined)
  const selected = value === '' ? null : Number(value)

  // Show the value on the line whenever it changes from outside the wheel: typed, set by an estimate, or reset.
  useEffect(() => {
    const wheel = track.current
    if (!wheel || turning.current) return
    wheel.scrollTop = (selected ?? 0) * WHEEL_ROW
  }, [selected])

  useEffect(() => () => window.clearTimeout(settle.current), [])

  const choose = (n: number) => onChange(String(Math.max(0, Math.min(max, n))))

  // Only a runner's own scroll picks a number; the wheel moving to show a typed one doesn't.
  const startTurning = () => {
    turning.current = true
  }

  const onScroll = () => {
    if (!turning.current) return
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      turning.current = false
      const wheel = track.current
      if (!wheel) return
      const n = Math.max(0, Math.min(max, Math.round(wheel.scrollTop / WHEEL_ROW)))
      if (n !== selected) choose(n)
    }, WHEEL_SETTLE_MS)
  }

  return (
    <div className="wheel">
      <label className="field-help" htmlFor={id}>
        {label}
      </label>
      <div className={`wheel-window${invalid ? ' is-invalid' : ''}`}>
        <div
          ref={track}
          className="wheel-track"
          aria-hidden="true"
          onScroll={onScroll}
          onWheel={startTurning}
          onTouchStart={startTurning}
          onPointerDown={startTurning}
        >
          <span className="wheel-pad" />
          {Array.from({ length: max + 1 }, (_, n) => (
            <span
              key={n}
              className={`wheel-item${n === selected ? ' is-selected' : ''}`}
              onClick={() => {
                turning.current = false
                choose(n)
                input.current?.focus({ preventScroll: true })
              }}
            >
              {String(n).padStart(2, '0')}
            </span>
          ))}
          <span className="wheel-pad" />
        </div>
        <span className="wheel-lens" aria-hidden="true" />
        <input
          ref={input}
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
    </div>
  )
}
