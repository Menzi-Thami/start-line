import { useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate } from '../../lib/format'
import type { Session, TrainingPlan } from '../../lib/types'

export function PrivateGym({ planId, session, today, onChanged, readOnly = false }: {
  planId: string; session: Session; today: string; onChanged: (plan: TrainingPlan) => void; readOnly?: boolean
}) {
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [date, setDate] = useState(session.date)
  const [preview, setPreview] = useState<{ token: string; proposed: TrainingPlan } | null>(null)
  const pending = useRef(false)
  const work = async (action: (token: string) => Promise<void>) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setMessage(null)
    try { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update gym.'); await action(token) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Couldn’t update gym. Try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  const id = session.prescriptionId!
  return <article className="strength-session">
    <h3>{formatDate(session.date)} · {session.title}</h3>
    <p>{session.detail}</p>
    <p className="field-help">{session.gym} body · {session.gymDone ? 'Completed' : 'Scheduled'}</p>
    {!readOnly && <>
      {session.date <= today && <button type="button" className="button button-quiet" disabled={busy} onClick={() => void work(async token => {
        onChanged(await api.me.completePrivateGym(token, planId, id, !session.gymDone)); setMessage(session.gymDone ? 'Gym completion removed.' : 'Gym completed. Your run is separate.')
      })}>{session.gymDone ? 'Undo gym completion' : 'Complete gym'}</button>}
      {session.date >= today && !session.gymDone && <details className="disclosure"><summary>Move gym</summary>
        <label className="field">New gym date<input type="date" min={today} value={date} onChange={event => { setDate(event.target.value); setPreview(null) }} /></label>
        <button type="button" className="button button-quiet" disabled={busy || !date || date === session.date} onClick={() => void work(async token => setPreview(await api.me.movePrivateGym(token, planId, id, date)))}>Preview gym move</button>
        {preview && <><p role="status">Move {session.title} to {formatDate(date)}? Running stays as prescribed.</p><button type="button" className="button" disabled={busy} onClick={() => void work(async token => {
          const result = await api.me.movePrivateGym(token, planId, id, date, preview.token); onChanged(result.proposed); setPreview(null)
        })}>Apply gym move</button></>}
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => void work(async token => {
          const undo = await api.me.movePrivateGym(token, planId, id, null)
          const result = await api.me.movePrivateGym(token, planId, id, null, undo.token); onChanged(result.proposed); setPreview(null)
        })}>Restore prescribed gym date</button>
      </details>}
    </>}
    {message && <p role="status">{message}</p>}
  </article>
}
