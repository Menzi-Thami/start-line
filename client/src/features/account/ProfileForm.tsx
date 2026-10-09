import { useId, useState, type FormEvent } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Runner, Units } from '../../lib/types'
import { RaceBib } from './RaceBib'

const detectedTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg'
  } catch {
    return 'Africa/Johannesburg'
  }
}

const allTimeZones = (): string[] => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

interface Props {
  /** Present when editing; absent when signing up. */
  runner?: Runner
  onSaved: (runner: Runner) => void
  /** The sign-up button text; the wizard says "Continue" because the plan questions come next. */
  submitLabel?: string
}

/** Sign-up and profile editing in one form. Sign-up adds the privacy notice, which must be accepted. */
export function ProfileForm({ runner, onSaved, submitLabel = 'Finish signing up' }: Props) {
  const auth = useAuth()
  const id = useId()
  const signingUp = runner === undefined
  const [name, setName] = useState(runner?.displayName ?? auth.account?.name ?? '')
  const [timeZone, setTimeZone] = useState(runner?.timeZone ?? detectedTimeZone())
  const [units, setUnits] = useState<Units>(runner?.units ?? 'Kilometres')
  const [weeklyEmails, setWeeklyEmails] = useState(runner?.weeklyEmails ?? true)
  const [accepted, setAccepted] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }>({ kind: 'idle' })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setStatus({ kind: 'error', message: 'Tell us what to call you.' })
      return
    }
    if (signingUp && !accepted) {
      setStatus({ kind: 'error', message: 'Please read and accept the privacy notice to sign up.' })
      return
    }
    setStatus({ kind: 'saving' })
    try {
      const token = await auth.getToken()
      if (!token) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
      const saved = await api.me.save(token, { displayName: name.trim(), timeZone, units, weeklyEmails, acceptPrivacyNotice: accepted })
      setStatus({ kind: 'saved' })
      onSaved(saved)
    } catch (error) {
      const fields = error instanceof ApiError ? Object.values(error.fieldErrors).flat() : []
      setStatus({ kind: 'error', message: fields[0] ?? (error instanceof Error ? error.message : 'That didn’t save. Try again.') })
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      {signingUp && <RaceBib name={name} official={accepted} />}

      <div className="field">
        <label className="field-label" htmlFor={`${id}-name`}>
          What should we call you?
        </label>
        <input id={`${id}-name`} className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${id}-tz`}>
          Your time zone
        </label>
        <input id={`${id}-tz`} className="input" list={`${id}-zones`} value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
        <datalist id={`${id}-zones`}>
          {allTimeZones().map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <p className="field-help">So your weekly email lands on a Sunday evening where you live, not ours.</p>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend className="field-label">Distances in</legend>
        <div className="pills">
          {(['Kilometres', 'Miles'] as const).map((u) => (
            <label className="pill" key={u}>
              <input type="radio" name={`${id}-units`} checked={units === u} onChange={() => setUnits(u)} />
              {u}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="session-done" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={weeklyEmails} onChange={(e) => setWeeklyEmails(e.target.checked)} />
        Send me a weekly email with how last week went and what’s next (coming soon)
      </label>

      {signingUp && (
        <div className="notice">
          <h3>What we keep, and why</h3>
          <ul>
            <li>Your name, email, time zone, units and the plans you save, so we can show your plans and send your weekly email.</li>
            <li>Sign-in is handled by Microsoft. We never see or store a password.</li>
            <li>We don’t sell your data or use it for advertising.</li>
            <li>You can download everything we hold, or delete your account and all of it, from Account at any time.</li>
          </ul>
          <label className="session-done" style={{ color: 'var(--ink)' }}>
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            I’ve read this and I’m happy for Taperday to keep this information.
          </label>
        </div>
      )}

      <div className="submit-row" style={{ marginTop: 'var(--space-4)' }}>
        <button type="submit" className="button button-primary" disabled={status.kind === 'saving'}>
          {status.kind === 'saving' ? 'Saving…' : signingUp ? submitLabel : 'Save changes'}
        </button>
        <span aria-live="polite">
          {status.kind === 'saved' && !signingUp && <span className="field-help">Saved.</span>}
          {status.kind === 'error' && <span className="field-error">{status.message}</span>}
        </span>
      </div>
    </form>
  )
}
