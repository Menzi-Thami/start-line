import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { TrainingPlan } from '../../lib/types'
import { formatDate, formatDistance } from '../../lib/format'
import { SessionSteps } from '../plan/SessionSteps'
import { JOURNEY_CHANGED } from '../journey/useJourney'

/** No file contents, preview tokens or prescriptions enter browser storage or URLs. */
export function PrivateImport() {
  const auth = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [preview, setPreview] = useState<{ importId: string; token: string; expiresAt: string; replacesCurrent: boolean; plan: TrainingPlan } | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const sequence = useRef(0)
  useEffect(() => {
    let cancelled = false
    const requests = sequence
    auth.getToken().then(token => token ? api.me.privateAccess(token) : null).then(access => {
      if (!cancelled) setEnabled(access?.enabled === true)
    }).catch(() => undefined)
    return () => { cancelled = true; requests.current++ }
  }, [auth])
  if (!enabled) return null
  const token = async () => { const value = await auth.getToken(); if (!value) throw new Error('Sign in again to import your prescription.'); return value }
  const read = async (file: File | undefined) => {
    const mine = ++sequence.current
    setPreview(null); setConsent(false); setMessage(null)
    if (!file) return
    setBusy(true)
    try {
      if (file.size > 512 * 1024) throw new Error('Choose a JSON file smaller than 512 KB.')
      const payload: unknown = JSON.parse(await file.text())
      const found = await api.me.previewPrivateImport(await token(), payload)
      if (mine === sequence.current) setPreview(found)
    } catch (error) { if (mine === sequence.current) setMessage(error instanceof Error ? error.message : 'Couldn’t preview this file. Your current plan is unchanged.') }
    finally { if (mine === sequence.current) setBusy(false) }
  }
  const activate = async () => {
    if (!preview || !consent || busy) return
    const mine = ++sequence.current
    setBusy(true); setMessage(null)
    try {
      await api.me.activatePrivateImport(await token(), preview.importId, preview.token)
      if (mine !== sequence.current) return
      setPreview(null); setConsent(false)
      setMessage('Your private prescription is current. Open Plan to see your schedule.')
      window.dispatchEvent(new Event(JOURNEY_CHANGED))
    } catch (error) { if (mine === sequence.current) setMessage(error instanceof Error ? error.message : 'Couldn’t activate. Check your current plan before retrying.') }
    finally { if (mine === sequence.current) setBusy(false) }
  }
  return <details className="disclosure section">
    <summary>Private prescription</summary>
    <p>Choose your private JSON file to review it. Your current plan changes only after you approve.</p>
    <label className="field">Prescription file<input type="file" accept=".json,application/json" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void read(file) }} /></label>
    {preview && <section aria-label="Private prescription preview">
      <h4>{preview.plan.race.name} · {formatDate(preview.plan.race.date)}</h4>
      <p>{formatDate(preview.plan.startDate)} to race day · {preview.plan.weeks.length} weeks · {formatDistance(preview.plan.weeks.reduce((km, week) => km + week.plannedKm, 0), 'km')}</p>
      <details className="disclosure"><summary>Review every session</summary>
        {preview.plan.weeks.map(week => <div key={week.number}><h5>Week {week.number} · {formatDistance(week.plannedKm, 'km')}</h5><ul>{week.sessions.map(session => <li key={session.prescriptionId ?? `${session.date}|${session.type}`}><strong>{formatDate(session.date)} · {session.title}</strong>{session.distanceKm > 0 ? ` · ${formatDistance(session.distanceKm, 'km')}` : ''}<p>{session.detail}</p>{session.steps.length > 0 && <SessionSteps steps={session.steps} units="km" />}</li>)}</ul></div>)}
      </details>
      <label className="check-field"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I reviewed this prescription and agree to make it current{preview.replacesCurrent ? ', archiving my current plan and keeping its history' : ''}.</label>
      <div className="submit-row"><button type="button" className="button button-primary" disabled={!consent || busy} onClick={() => void activate()}>{busy ? 'Saving…' : 'Make prescription current'}</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => { sequence.current++; setPreview(null); setConsent(false) }}>Cancel preview</button></div>
    </section>}
    {busy && <p role="status">Checking your private prescription…</p>}
    {message && <p role="status">{message}</p>}
  </details>
}
