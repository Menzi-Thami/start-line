import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { JOURNEY_CHANGED } from './useJourney'

export function ArchiveChapter({ planId, version, onArchived }: { planId: string; version: string; onArchived: () => void }) {
  const auth = useAuth()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const identity = useRef(0)
  useEffect(() => () => { identity.current++ }, [auth])
  const archive = async () => {
    if (busy) return
    const mine = identity.current
    setBusy(true); setError(null)
    try {
      const token = await auth.getToken()
      if (mine !== identity.current) return
      if (!token) throw new Error('Sign in again to archive your plan.')
      await api.me.journey.archive(token, planId, version)
      if (mine !== identity.current) return
      window.dispatchEvent(new Event(JOURNEY_CHANGED))
      onArchived()
      setConfirm(false)
    } catch (reason) {
      if (mine === identity.current) setError(reason instanceof Error ? reason.message : 'Your plan couldn’t be archived. Try again.')
    } finally { if (mine === identity.current) setBusy(false) }
  }
  return <div className="chapter-archive">
    {!confirm ? <button type="button" className="button button-quiet" onClick={() => setConfirm(true)}>Archive training plan</button>
      : <div className="journey-state">
        <p>Your chapter, logged runs, race result and trophies stay here. Recovery continues. This clears your current training plan.</p>
        <div className="journey-actions">
          <button type="button" className="button" disabled={busy} onClick={() => void archive()}>{busy ? 'Archiving…' : 'Keep chapter and archive'}</button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => { setConfirm(false); setError(null) }}>Keep current plan</button>
        </div>
      </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>
}
