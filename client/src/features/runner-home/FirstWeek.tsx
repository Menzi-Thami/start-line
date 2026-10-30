import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { StravaStatus } from '../../lib/types'

const DISMISSED = 'taperday:first-week-dismissed'

const isStandalone = () => typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches

interface Props {
  hasRuns: boolean
  strava?: StravaStatus
  onOpenRuns: () => void
  onOpenAccount: () => void
}

/**
 * Three steps that make a plan worth having, after it's saved: bring in runs (so the coach has something to go on), turn
 * on reminders, and put Taperday on the home screen. Each ticks itself off from what's true; the card goes once all
 * three are done, or when the runner hides it.
 */
export function FirstWeek({ hasRuns, strava, onOpenRuns, onOpenAccount }: Props) {
  const auth = useAuth()
  const [reminders, setReminders] = useState<boolean | null>(null)
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISSED) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.reminders.get(token) : null))
      .then((r) => {
        if (!cancelled) setReminders(r ? r.devices.length > 0 : null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [auth])

  const steps = [
    { id: 'runs', done: hasRuns || !!strava?.connected, title: 'Bring in your runs', why: 'Connect Strava or upload from your watch, so the coach adjusts to what you actually ran.', action: 'Add runs', onClick: onOpenRuns },
    { id: 'reminders', done: reminders === true, title: 'Turn on reminders', why: 'A nudge on run days and a heads-up before long runs.', action: 'Turn on', onClick: onOpenAccount },
    { id: 'home', done: isStandalone(), title: 'Add Taperday to your home screen', why: 'It opens like an app, straight on your plan.', action: 'Show me', onClick: onOpenAccount },
  ]
  const left = steps.filter((s) => !s.done).length
  if (hidden || left === 0 || reminders === null) return null

  const hide = () => {
    setHidden(true)
    try {
      window.localStorage.setItem(DISMISSED, '1')
    } catch {
      // Storage blocked: it's hidden for this visit.
    }
  }

  return (
    <section className="panel first-week" aria-labelledby="first-week">
      <div className="first-week-head">
        <h2 id="first-week" className="home-card-heading">
          Get set up · {steps.length - left} of {steps.length}
        </h2>
        <button type="button" className="link-button field-help" onClick={hide}>
          Hide
        </button>
      </div>
      <ol className="first-week-steps">
        {steps.map((s) => (
          <li key={s.id} className={s.done ? 'is-done' : undefined}>
            <span className="first-week-mark" aria-hidden="true">
              {s.done ? '✓' : ''}
            </span>
            <div>
              <p className="first-week-title">
                {s.title}
                {s.done && <span className="visually-hidden">, done</span>}
              </p>
              {!s.done && <p className="field-help">{s.why}</p>}
            </div>
            {!s.done && (
              <button type="button" className="button button-quiet" onClick={s.onClick}>
                {s.action}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
