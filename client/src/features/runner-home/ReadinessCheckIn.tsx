import { useCallback, useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate } from '../../lib/format'
import type { Feeling, Readiness, SleepQuality, Soreness } from '../../lib/types'

const FEELINGS: readonly { value: Feeling; label: string }[] = [
  { value: 'Fresh', label: 'Fresh' },
  { value: 'Okay', label: 'Okay' },
  { value: 'Tired', label: 'Tired' },
  { value: 'Unwell', label: 'Unwell' },
]
const SLEEP: readonly { value: SleepQuality; label: string }[] = [
  { value: 'Good', label: 'Slept well' },
  { value: 'Okay', label: 'Slept okay' },
  { value: 'Poor', label: 'Slept badly' },
]
const SORENESS: readonly { value: Soreness; label: string }[] = [
  { value: 'None', label: 'No soreness' },
  { value: 'Some', label: 'A bit sore' },
  { value: 'Heavy', label: 'Very sore' },
]
const MAX_NOTE = 280

function isReadinessList(value: unknown): value is Readiness[] {
  return Array.isArray(value) && value.every((r) => typeof r === 'object' && r !== null && typeof (r as Readiness).date === 'string' && typeof (r as Readiness).feeling === 'string')
}

function dayName(date: string, today: string): string {
  if (date === today) return 'Today'
  const yesterday = new Date(`${today}T12:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return date === yesterday.toISOString().slice(0, 10) ? 'Yesterday' : formatDate(date)
}

function summary(r: Readiness): string {
  return [
    FEELINGS.find((f) => f.value === r.feeling)?.label,
    r.sleep ? SLEEP.find((s) => s.value === r.sleep)?.label.toLowerCase() : null,
    r.soreness ? SORENESS.find((s) => s.value === r.soreness)?.label.toLowerCase() : null,
  ].filter(Boolean).join(' · ')
}

/** What a tired or unwell day suggests: plain guidance, never a diagnosis, and the plan only changes through the review. */
function Guidance({ feeling, onReview }: { feeling: Feeling; onReview?: () => void }) {
  if (feeling !== 'Tired' && feeling !== 'Unwell') return null
  return (
    <div className="callout readiness-guidance">
      <p>
        {feeling === 'Tired'
          ? 'Take it easier today: an easy run or a rest day both count. If it lasts more than a few days, ease the rest of your week.'
          : 'Rest today. Don’t run with a fever or chest symptoms, and if it doesn’t settle in a few days, see a doctor.'}
      </p>
      <p className="field-help">Your weekly review uses today’s answer. Nothing changes until you apply a change there.</p>
      {onReview && (
        <button type="button" className="link-button" onClick={onReview}>
          Review this week →
        </button>
      )}
    </div>
  )
}

/**
 * How the runner feels, day by day: optional, saved to their account (not just this device), and theirs to change or
 * clear for the last two weeks. The weekly review hears today's or yesterday's answer; it never changes the plan alone.
 */
export function ReadinessCheckIn({ today, onReview }: { today: string; onReview?: () => void }) {
  const auth = useAuth()
  const noteId = useId()
  const [days, setDays] = useState<Readiness[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [date, setDate] = useState(today)
  const [sleep, setSleep] = useState<SleepQuality | null>(null)
  const [soreness, setSoreness] = useState<Soreness | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.readiness(token) : Promise.reject(new Error('Sign in to keep your check-ins.'))))
      .then((data) => {
        if (!isReadinessList(data)) throw new Error('Check-ins aren’t available right now.')
        if (!cancelled) {
          setDays(data)
          setFailed(false)
        }
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [auth])

  useEffect(() => load(), [load])

  const entry = days?.find((d) => d.date === date) ?? null
  const todays = days?.find((d) => d.date === today) ?? null

  // Picking a day loads its details into the form.
  const pick = (next: string) => {
    const existing = days?.find((d) => d.date === next) ?? null
    setDate(next)
    setSleep(existing?.sleep ?? null)
    setSoreness(existing?.soreness ?? null)
    setNote(existing?.note ?? '')
    setMessage(null)
  }

  const act = async (work: (token: string) => Promise<string>) => {
    setBusy(true)
    setMessage(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Sign in again to save how you feel.')
      setMessage({ text: await work(token) })
      load()
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'That didn’t save. Try again.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const named = (day: string) => (day === today ? 'today' : dayName(day, today))

  const save = (feeling: Feeling) =>
    act(async (token) => {
      await api.me.logReadiness(token, date, { feeling, sleep, soreness, note: note.trim() || null })
      return `Saved for ${named(date)}.`
    })

  const clear = (day: string) =>
    act(async (token) => {
      await api.me.clearReadiness(token, day)
      if (day === date) {
        setSleep(null)
        setSoreness(null)
        setNote('')
      }
      return `Cleared ${named(day)}.`
    })

  return (
    <details className="disclosure readiness">
      <summary>
        How are you feeling today?{todays ? <span className="field-help readiness-today">· {FEELINGS.find((f) => f.value === todays.feeling)?.label}</span> : null}
      </summary>
      <p className="field-help">Optional. Saved to your account and private to you. It never changes your plan by itself.</p>
      {failed && <p className="field-help">Your check-ins couldn’t load. You can still save today’s.</p>}
      {date !== today && (
        <p className="readiness-editing">
          Changing {formatDate(date)}.{' '}
          <button type="button" className="link-button" onClick={() => pick(today)}>
            Back to today
          </button>
        </p>
      )}
      <div className="pills" role="group" aria-label={`How you feel, ${named(date)}`}>
        {FEELINGS.map((f) => (
          <button key={f.value} type="button" className="button button-quiet" aria-pressed={entry?.feeling === f.value} disabled={busy} onClick={() => void save(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <details className="readiness-more">
        <summary>Add sleep, soreness or a note</summary>
        <div className="pills" role="group" aria-label="Sleep">
          {SLEEP.map((s) => (
            <button key={s.value} type="button" className="button button-quiet" aria-pressed={sleep === s.value} onClick={() => setSleep(sleep === s.value ? null : s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="pills" role="group" aria-label="Soreness">
          {SORENESS.map((s) => (
            <button key={s.value} type="button" className="button button-quiet" aria-pressed={soreness === s.value} onClick={() => setSoreness(soreness === s.value ? null : s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={noteId}>
            Note
          </label>
          <textarea id={noteId} className="input" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="field-help">{MAX_NOTE - note.length} characters left</p>
        </div>
        <p className="field-help">{entry ? 'Tap how you feel again to save these.' : 'Then tap how you feel to save.'}</p>
      </details>
      {date === today && entry && <Guidance feeling={entry.feeling} onReview={onReview} />}
      {message && (
        <p className={message.error ? 'field-error' : 'field-help'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {days && days.length > 0 && (
        <div className="readiness-history">
          <h3>Last two weeks</h3>
          <ul>
            {days.map((d) => (
              <li key={d.date}>
                <span className="readiness-day">{dayName(d.date, today)}</span> <span>{summary(d)}</span>
                {d.note && <span className="field-help"> · “{d.note}”</span>}
                <span className="readiness-actions">
                  <button type="button" className="link-button" onClick={() => pick(d.date)} aria-label={`Change ${named(d.date)}`}>
                    Change
                  </button>
                  <button type="button" className="link-button" disabled={busy} onClick={() => void clear(d.date)} aria-label={`Clear ${named(d.date)}`}>
                    Clear
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  )
}
