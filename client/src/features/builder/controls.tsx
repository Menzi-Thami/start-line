import { useId } from 'react'
import { SHORT_DAY, WEEK, type DayOfWeek } from '../../lib/types'
import type { Duration } from './duration'
import { TimeWheel } from './TimeWheel'

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="field-error" id={id}>
      {message}
    </p>
  ) : null
}

interface DayPillsProps {
  legend: string
  hint?: string
  selected: DayOfWeek[]
  onChange: (days: DayOfWeek[]) => void
  max?: number
  disabledDays?: readonly DayOfWeek[]
  error?: string
}

/** Days as checkbox pills. Real inputs underneath, so keyboard and screen readers work without extra code. */
export function DayPills({ legend, hint, selected, onChange, max, disabledDays = [], error }: DayPillsProps) {
  const id = useId()
  const full = max !== undefined && selected.length >= max
  const toggle = (day: DayOfWeek, on: boolean) =>
    onChange(on ? WEEK.filter((d) => d === day || selected.includes(d)) : selected.filter((d) => d !== day))

  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 var(--space-4)' }} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}>
      <legend className="field-label">{legend}</legend>
      {hint && <p className="field-help" id={`${id}-hint`}>{hint}</p>}
      <div className="pills">
        {WEEK.map((day) => {
          const checked = selected.includes(day)
          return (
            <label className="pill" key={day}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && (full || disabledDays.includes(day))}
                onChange={(e) => toggle(day, e.target.checked)}
                aria-label={day}
              />
              {SHORT_DAY[day]}
            </label>
          )
        })}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  )
}

interface DayChoiceProps {
  legend: string
  days: DayOfWeek[]
  value: DayOfWeek | null
  onChange: (day: DayOfWeek) => void
  error?: string
}

/** Picks one of the days already chosen. */
export function DayChoice({ legend, days, value, onChange, error }: DayChoiceProps) {
  const id = useId()
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 var(--space-4)' }}>
      <legend className="field-label">{legend}</legend>
      {days.length === 0 ? (
        <p className="field-help">Choose your run days first.</p>
      ) : (
        <div className="pills" role="radiogroup">
          {WEEK.filter((d) => days.includes(d)).map((day) => (
            <label className="pill" key={day}>
              <input type="radio" name={`${id}-day`} checked={value === day} onChange={() => onChange(day)} aria-label={day} />
              {SHORT_DAY[day]}
            </label>
          ))}
        </div>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  )
}

interface DurationInputProps {
  legend: string
  value: Duration
  onChange: (value: Duration) => void
  error?: string
  help?: string
}

/**
 * Hours, minutes and seconds as three wheels, scrolled like a phone's time picker (or typed): "3:45" can't be misread
 * as minutes. One drum with one band across it, so the chosen time reads as a time: 03 hr : 45 min : 00 sec.
 */
export function DurationInput({ legend, value, onChange, error, help }: DurationInputProps) {
  const id = useId()
  const part = (key: keyof Duration, label: string, unit: string, max: number) => (
    <TimeWheel
      id={`${id}-${key}`}
      label={label}
      unit={unit}
      value={value[key]}
      max={max}
      onChange={(next) => onChange({ ...value, [key]: next })}
      invalid={!!error}
      describedBy={error ? `${id}-error` : undefined}
    />
  )

  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend className="field-label">{legend}</legend>
      <div className={`wheels${error ? ' is-invalid' : ''}`}>
        {part('h', 'Hours', 'hr', 99)}
        <span className="wheel-colon" aria-hidden="true">
          :
        </span>
        {part('m', 'Minutes', 'min', 59)}
        <span className="wheel-colon" aria-hidden="true">
          :
        </span>
        {part('s', 'Seconds', 'sec', 59)}
      </div>
      {help && <p className="goal-pace">{help}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  )
}
