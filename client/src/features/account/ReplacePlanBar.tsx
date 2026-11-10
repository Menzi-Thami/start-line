import { useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { GeneratePlanRequest } from '../../lib/types'
import { sameRace, type CurrentPlan } from './useCurrentPlan'
import './replace-plan-bar.css'

interface Props {
  /** The plan on screen, which isn't the runner's saved plan. */
  request: GeneratePlanRequest
  /** The race on screen, in words. */
  raceName: string
  /** The runner's saved plan, which stays as it is until they say otherwise. */
  saved: CurrentPlan
  /** Called after the plan on screen became the runner's plan. */
  onReplaced: () => void
  /** Back to the saved plan, leaving it untouched. */
  onKeep: () => void
}

/**
 * A plan on screen that isn't the runner's saved one (another race, or the same race with a new goal) is never saved
 * silently and never lost silently either: this bar sits above it until the runner picks.
 */
export function ReplacePlanBar({ request, raceName, saved, onReplaced, onKeep }: Props) {
  const auth = useAuth()
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string }>({ kind: 'idle' })
  const saving = useRef(false)
  // The same race with new answers updates the saved plan and keeps its history; another race replaces it.
  const update = sameRace(request, saved.inputs)

  const save = async () => {
    if (saving.current) return
    saving.current = true
    setStatus({ kind: 'saving' })
    try {
      const token = await auth.getToken()
      if (!token) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
      await api.me.savePlan(token, request, update ? saved.name : undefined, true, update ? saved.id : undefined)
      onReplaced()
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t save. Try again.' })
    } finally {
      saving.current = false
    }
  }

  return (
    <section className="panel replace-plan-bar" aria-label="This plan is not saved yet">
      <div>
        <p><strong>This plan isn’t saved yet.</strong></p>
        <p className="field-help">
          {update
            ? 'Your saved plan still has your earlier answers. Update it, or keep it as it was.'
            : `Your saved plan is still ${saved.name}. Make ${raceName} your plan, or keep the one you have.`}
        </p>
        {status.kind === 'error' && <p className="field-error" role="alert">{status.message}</p>}
      </div>
      <div className="submit-row">
        <button type="button" className="button button-primary" onClick={() => void save()} disabled={status.kind === 'saving'}>
          {status.kind === 'saving' ? 'Saving…' : update ? 'Update my plan' : 'Replace my plan'}
        </button>
        <button type="button" className="button button-quiet" onClick={onKeep} disabled={status.kind === 'saving'}>
          Keep my old plan
        </button>
      </div>
    </section>
  )
}
